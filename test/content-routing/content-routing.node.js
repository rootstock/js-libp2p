'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
const { expect } = chai
const nock = require('nock')
const sinon = require('sinon')

const pDefer = require('p-defer')
const mergeOptions = require('merge-options')

const CID = require('cids')
const DelegatedContentRouter = require('libp2p-delegated-content-routing')
const multiaddr = require('multiaddr')

const peerUtils = require('../utils/creators/peer')
const { baseOptions, routingOptions } = require('./utils')

describe('content-routing', () => {
  describe('no routers', () => {
    let node

    before(async () => {
      [node] = await peerUtils.createPeer({
        config: baseOptions
      })
    })

    it('.findProviders should return an error', async () => {
      try {
        for await (const _ of node.contentRouting.findProviders('a cid')) {} // eslint-disable-line
        throw new Error('.findProviders should return an error')
      } catch (err) {
        expect(err).to.exist()
        expect(err.code).to.equal('NO_ROUTERS_AVAILABLE')
      }
    })

    it('.provide should return an error', async () => {
      await expect(node.contentRouting.provide('a cid'))
        .to.eventually.be.rejected()
        .and.to.have.property('code', 'NO_ROUTERS_AVAILABLE')
    })
  })

  describe('via dht router', () => {
    const number = 5
    let nodes

    before(async () => {
      nodes = await peerUtils.createPeer({
        number,
        config: routingOptions
      })

      // Ring dial
      await Promise.all(
        nodes.map((peer, i) => peer.dial(nodes[(i + 1) % number].peerInfo))
      )
    })

    afterEach(() => {
      sinon.restore()
    })

    after(() => Promise.all(nodes.map((n) => n.stop())))

    it('should use the nodes dht to provide', () => {
      const deferred = pDefer()

      sinon.stub(nodes[0]._dht, 'provide').callsFake(() => {
        deferred.resolve()
      })

      nodes[0].contentRouting.provide()
      return deferred.promise
    })

    it('should use the nodes dht to find providers', async () => {
      const deferred = pDefer()

      sinon.stub(nodes[0]._dht, 'findProviders').callsFake(function * () {
        deferred.resolve()
        yield
      })

      await nodes[0].contentRouting.findProviders().next()

      return deferred.promise
    })
  })

  describe('via delegate router', () => {
    let node
    let delegate

    beforeEach(async () => {
      const [peerInfo] = await peerUtils.createPeerInfo({ fixture: false })

      delegate = new DelegatedContentRouter(peerInfo.id, {
        host: '0.0.0.0',
        protocol: 'http',
        port: 60197
      }, [
        multiaddr('/ip4/0.0.0.0/tcp/60197')
      ])

      ;[node] = await peerUtils.createPeer({
        config: mergeOptions(baseOptions, {
          modules: {
            contentRouting: [delegate]
          },
          config: {
            dht: {
              enabled: false
            }
          }
        })
      })
    })

    afterEach(() => {
      sinon.restore()
    })

    afterEach(() => node.stop())

    it('should use the delegate router to provide', () => {
      const deferred = pDefer()

      sinon.stub(delegate, 'provide').callsFake(() => {
        deferred.resolve()
      })

      node.contentRouting.provide()
      return deferred.promise
    })

    it('should use the delegate router to find providers', async () => {
      const deferred = pDefer()

      sinon.stub(delegate, 'findProviders').callsFake(function * () {
        deferred.resolve()
        yield
      })

      await node.contentRouting.findProviders().next()

      return deferred.promise
    })

    it('should be able to register as a provider', async () => {
      const cid = new CID('QmU621oD8AhHw6t25vVyfYKmL9VV3PTgc52FngEhTGACFB')
      const mockApi = nock('http://0.0.0.0:60197')
        // mock the refs call
        .post('/api/v0/refs')
        .query({
          recursive: false,
          arg: cid.toBaseEncodedString()
        })
        .reply(200, null, [
          'Content-Type', 'application/json',
          'X-Chunked-Output', '1'
        ])

      await node.contentRouting.provide(cid)

      expect(mockApi.isDone()).to.equal(true)
    })

    it('should handle errors when registering as a provider', async () => {
      const cid = new CID('QmU621oD8AhHw6t25vVyfYKmL9VV3PTgc52FngEhTGACFB')
      const mockApi = nock('http://0.0.0.0:60197')
        // mock the refs call
        .post('/api/v0/refs')
        .query({
          recursive: false,
          arg: cid.toBaseEncodedString()
        })
        .reply(502, 'Bad Gateway', ['Content-Type', 'application/json'])

      await expect(node.contentRouting.provide(cid))
        .to.eventually.be.rejected()

      expect(mockApi.isDone()).to.equal(true)
    })

    it('should be able to find providers', async () => {
      const cid = new CID('QmU621oD8AhHw6t25vVyfYKmL9VV3PTgc52FngEhTGACFB')
      const provider = 'QmZNgCqZCvTsi3B4Vt7gsSqpkqDpE7M2Y9TDmEhbDb4ceF'

      const mockApi = nock('http://0.0.0.0:60197')
        .post('/api/v0/dht/findprovs')
        .query({
          arg: cid.toBaseEncodedString()
        })
        .reply(200, `{"Extra":"","ID":"QmWKqWXCtRXEeCQTo3FoZ7g4AfnGiauYYiczvNxFCHicbB","Responses":[{"Addrs":["/ip4/0.0.0.0/tcp/0"],"ID":"${provider}"}],"Type":4}\n`, [
          'Content-Type', 'application/json',
          'X-Chunked-Output', '1'
        ])

      const providers = []
      for await (const provider of node.contentRouting.findProviders(cid, { timeout: 1000 })) {
        providers.push(provider)
      }

      expect(providers).to.have.length(1)
      expect(providers[0].id.toB58String()).to.equal(provider)
      expect(mockApi.isDone()).to.equal(true)
    })

    it('should handle errors when finding providers', async () => {
      const cid = new CID('QmU621oD8AhHw6t25vVyfYKmL9VV3PTgc52FngEhTGACFB')
      const mockApi = nock('http://0.0.0.0:60197')
        .post('/api/v0/dht/findprovs')
        .query({
          arg: cid.toBaseEncodedString()
        })
        .reply(502, 'Bad Gateway', [
          'X-Chunked-Output', '1'
        ])

      try {
        for await (const _ of node.contentRouting.findProviders(cid)) { } // eslint-disable-line
        throw new Error('should handle errors when finding providers')
      } catch (err) {
        expect(err).to.exist()
      }

      expect(mockApi.isDone()).to.equal(true)
    })
  })

  describe('via dht and delegate routers', () => {
    let node
    let delegate

    beforeEach(async () => {
      const [peerInfo] = await peerUtils.createPeerInfo({ fixture: false })

      delegate = new DelegatedContentRouter(peerInfo.id, {
        host: '0.0.0.0',
        protocol: 'http',
        port: 60197
      }, [
        multiaddr('/ip4/0.0.0.0/tcp/60197')
      ])

      ;[node] = await peerUtils.createPeer({
        config: mergeOptions(routingOptions, {
          modules: {
            contentRouting: [delegate]
          }
        })
      })
    })

    afterEach(() => {
      sinon.restore()
    })

    afterEach(() => node.stop())

    it('should use both the dht and delegate router to provide', async () => {
      const dhtDeferred = pDefer()
      const delegatedDeferred = pDefer()

      sinon.stub(node._dht, 'provide').callsFake(() => {
        dhtDeferred.resolve()
      })

      sinon.stub(delegate, 'provide').callsFake(() => {
        delegatedDeferred.resolve()
      })

      await node.contentRouting.provide()

      await Promise.all([
        dhtDeferred.promise,
        delegatedDeferred.promise
      ])
    })

    it('should only use the dht if it finds providers', async () => {
      const results = [true]

      sinon.stub(node._dht, 'findProviders').callsFake(function * () {
        yield results[0]
      })

      sinon.stub(delegate, 'findProviders').callsFake(function * () { // eslint-disable-line require-yield
        throw new Error('the delegate should not have been called')
      })

      const providers = []
      for await (const prov of node.contentRouting.findProviders('a cid')) {
        providers.push(prov)
      }

      expect(providers).to.have.length.above(0)
      expect(providers).to.eql(results)
    })

    it('should use the delegate if the dht fails to find providers', async () => {
      const results = [true]

      sinon.stub(node._dht, 'findProviders').callsFake(function * () {})

      sinon.stub(delegate, 'findProviders').callsFake(function * () {
        yield results[0]
      })

      const providers = []
      for await (const prov of node.contentRouting.findProviders('a cid')) {
        providers.push(prov)
      }

      expect(providers).to.have.length.above(0)
      expect(providers).to.eql(results)
    })
  })
})
