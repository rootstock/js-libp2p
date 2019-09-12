'use strict'

const {
  multiplexInbound,
  multiplexOutbound
} = require('./multiplex')
const { encryptInbound, encryptOutbound } = require('./encrypt')
const multiaddr = require('multiaddr')
const promisify = require('promisify-es6')
const createFromB58String = require('peer-id').createFromB58String
const { Connection } = require('interface-connection')
const debug = require('debug')
const log = debug('dial:upgrade')
log.error = debug('error:dial:upgrade')
log.debug = debug('debug:dial:upgrade')

/**
 * @typedef MultiaddrConnection
 * @property {function} sink
 * @property {AsyncIterator} source
 * @property {*} conn
 * @property {Multiaddr} remoteAddr
 */

/**
 * @class Upgrader
 */
class Upgrader {
  /**
   * @param {object} param0
   * @param {PeerInfo} param0.localPeer
   * @param {Map<string, Crypto>} param0.cryptos
   * @param {Map<string, Muxer>} param0.muxers
   */
  constructor({ localPeer, cryptos, muxers }) {
    this.localPeer = localPeer
    this.cryptos = cryptos
    this.muxers =  muxers
  }

  /**
   *
   * @param {MultiaddrConnection} param0
   */
  async upgradeOutbound ({ source, sink, conn, remoteAddr }) {
    const connection = new Connection(remoteAddr, true)

    let remotePeerId
    try {
      remotePeerId = createFromB58String(remoteAddr.getPeerId())
    } catch (err) {
      log.debug(err)
    }

    const result = await encryptOutbound(this.localPeer.id, { source, sink }, remotePeerId, this.cryptos)
    const muxer = await multiplexOutbound(result.conn, this.muxers)

    connection.encryption = cryptoTag
    connection.multiplexer = muxer
    connection.remotePeer = remotePeer
    // TODO: Do we keep a reference to the underlying connection?
    // Ideally we'd be able to do everything through the muxer and have that
    // tricke down to `conn`. If we don't have a muxer (unmuxed conns) we could
    // wrap the conn in a pho muxer?
    connection.conn = conn

    return connection
  }

  async upgradeInbound ({ source, sink, conn, remoteAddr }) {
    const connection = new Connection(remoteAddr, true)

    const result = await encryptInbound(this.localPeer.id, { source, sink }, this.cryptos)

    // TODO: Handle all muxer tags and wait for muxing to happen
    const muxer = await multiplexInbound(result.conn, this.muxers)

    connection.encryption = cryptoTag
    connection.multiplexer = muxer
    connection.remotePeer = remotePeer

    // TODO: Do we keep a reference to the underlying connection?
    // Ideally we'd be able to do everything through the muxer and have that
    // trickle down to `conn`. If we don't have a muxer (unmuxed conns) we could
    // wrap the conn in a pho muxer?
    connection.conn = conn

    return connection
  }
}

/**
 * @private
 * @param {object} options
 * @param {PeerInfo} options.localPeer
 * @param {Map<string, Crypto>} options.cryptos
 * @param {Map<string, Muxer>} options.muxers
 * @returns {function(connection)} A connection upgrade function that returns a Libp2p Connection
 */
function getUpgrader ({ localPeer, cryptos, muxers }) {
  return new Upgrader({
    localPeer, cryptos, muxers
  })
}

module.exports.getUpgrader = getUpgrader
