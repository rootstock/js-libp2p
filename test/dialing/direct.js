/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const sinon = require('sinon')

const PeerIds = require('../fixtures/peers')
const createPeerId = require('peer-id').createFromJSON
const PeerInfo = require('peer-info')
const Libp2p = require('./bundle-node')
const pipe = require('it-pipe')

describe('direct dialing', () => {
  let libp2p
  let remoteLibp2p

  before('create nodes', async () => {
    const [peerId1, peerId2] = await Promise.all([
      createPeerId(PeerIds.shift()),
      createPeerId(PeerIds.shift())
    ])

    const peerInfo1 = new PeerInfo(peerId1)
    peerInfo1.multiaddrs.add('/ip4/0.0.0.0/tcp/8080')
    // peerInfo1.multiaddrs.add('/ip4/0.0.0.0/tcp/0/ws')
    const peerInfo2 = new PeerInfo(peerId2)
    peerInfo2.multiaddrs.add('/ip4/0.0.0.0/tcp/10000')
    // peerInfo2.multiaddrs.add('/ip4/0.0.0.0/tcp/0/ws')

    libp2p = new Libp2p({ peerInfo: peerInfo1, config: { peerDiscovery: { autoDial: false } } })
    remoteLibp2p = new Libp2p({ peerInfo: peerInfo2, config: { peerDiscovery: { autoDial: false } } })
  })

  before('start nodes', async () => {
    await Promise.all([
      libp2p.start(),
      remoteLibp2p.start()
    ])
  })

  after('cleanup', async () => {
    await Promise.all([
      libp2p.stop(),
      remoteLibp2p.stop()
    ])
  })

  afterEach(() => {
    libp2p.peerBook.remove(remoteLibp2p.peerInfo)
    sinon.restore()
  })

  describe('multiaddrs', () => {
    it.only('should dial the provided multiaddr first', async () => {
      const spy = sinon.spy(libp2p._switch, 'dialAddress')

      const addr = remoteLibp2p.peerInfo.multiaddrs.toArray().pop()
      const addrWithId = `${addr.toString()}/p2p/${remoteLibp2p.peerInfo.id.toB58String()}`
      const connection = await libp2p.connect(addrWithId)
      expect(connection).to.exist()
      expect(spy.callCount).to.eql(1)
      expect(spy.getCall(0).args[0].toString()).to.eql(addrWithId)

      const { stream, protocol } = await connection.newStream('/echo/1.0.0')
      const data = await pipe(
        [Buffer.from('hi')],
        stream,
        async source => {
          let data = []
          for await (const chunk of source) {
            data.push(chunk.slice())
          }
          return data
        }
      )

      expect(data[0]).to.eql(Buffer.from('hi'))
    })

    it('should fallback to other known multiaddrs if the given multiaddr fails', async () => {
      const spy = sinon.spy(libp2p._switch, 'dialAddress')
      libp2p.peerBook.put(remoteLibp2p.peerInfo)
      const addrOptions = libp2p.peerInfo.multiaddrs.toArray().shift().toOptions()

      // Dial our own port with their id, this will cause crypto to fail
      await libp2p.connect(`/ip4/127.0.0.1/tcp/${addrOptions.port}/p2p/${remoteLibp2p.peerInfo.id.toB58String()}`)
      expect(spy.callCount).to.eql(2)
    })

    it('should be able to dial our own address', async () => {
      const spy = sinon.spy(libp2p._switch, 'dialAddress')

      const addr = libp2p.peerInfo.multiaddrs.toArray().pop()
      await libp2p.connect(addr)
      expect(spy.callCount).to.eql(1)
      expect(spy.getCall(0).args[0]).to.eql(addr)
    })
  })

  describe('peers', () => {
    it('should dial known multiaddrs of the peer', async () => {
      const spy = sinon.spy(libp2p._switch, 'dialAddress')
      await libp2p.connect(remoteLibp2p.peerInfo)
      expect(spy.callCount).to.eql(1)
      expect(spy.getCall(0).args[0]).to.eql(remoteLibp2p.peerInfo.multiaddrs.toArray()[0])
    })

    it.skip('should dial local multiaddrs last', () => expect.fail())
  })
})
