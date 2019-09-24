/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const sinon = require('sinon')
const promisify = require('promisify-es6')
const { default: PQueue } = require('p-queue')

const PeerIds = require('../fixtures/peers')
const createPeerId = promisify(require('peer-id').createFromJSON)
const PeerInfo = require('peer-info')
const Libp2p = require('../utils/bundle-nodejs')

describe('dialing queue', () => {
  let libp2p

  before('create nodes', async () => {
    const peerId1 = await createPeerId(PeerIds.shift())

    const peerInfo1 = new PeerInfo(peerId1)
    libp2p = new Libp2p({ peerInfo: peerInfo1, config: { peerDiscovery: { autoDial: false } } })
  })

  before('start nodes', async () => {
    await libp2p.start()
  })

  after('cleanup', async () => {
    await libp2p.stop()
  })

  afterEach(() => {
    sinon.restore()
  })

  // Need a queue to add all dial requests to
  it('should limit concurrent dial requests', async () => {
    const now = Date.now()
    function delay (time) {
      return new Promise(resolve => {
        setTimeout(() => {
          console.log('Time:', time, Date.now() - now)
          resolve()
        }, time)
      })
    }

    const queue = new PQueue({ concurrency: 50 })
    queue.concurrency = 2
    queue.add(() => delay(2001)) // Starts 1, finishes 2
    queue.add(() => delay(1002)) // Starts 2, finishes 1
    queue.add(() => delay(1003)) // Starts 3, finishes 3

    await queue.onIdle()
  })

  // Each dialPeer request should have its own limiter (this is not needed until we support parallel dials to a peer)
  it.skip('should count multiple addresses to a given peer as a single queue item', () => expect.fail())
})
