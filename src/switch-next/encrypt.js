'use strict'

const debug = require('debug')
const log = debug('dial')
log.error = debug('error:dial')
const MSS = require('it-multistream-select')

/**
 * Attempts to encrypt the given `connection` with the provided `cryptos`.
 * The first `Crypto` module to succeed will be used
 * @private
 * @async
 * @param {PeerId} localPeer The initiators PeerInfo
 * @param {*} connection
 * @param {PeerId} remotePeerId
 * @param {Map<string, Crypto>} cryptos
 * @returns {[connection, string]} An encrypted connection and the tag of the `Crypto` used
 */
async function encryptOutbound (localPeer, connection, remotePeerId, cryptos) {
  const mss = new MSS.Dialer(connection)
  const { stream, protocol } = await mss.select(Array.from(cryptos.keys()))
  const crypto = cryptos.get(protocol)
  log('encrypting outbound connection to %s', remotePeerId.toB58String())
  const { conn, remotePeer } = await crypto.secureOutbound(localPeer, stream, remotePeerId)

  if (conn) return {
    conn,
    remotePeer,
    protocol
  }

  throw new Error('All encryption failed')
}

/**
 * Attempts to encrypt the incoming `connection` with the provided `cryptos`.
 * @private
 * @async
 * @param {PeerId} localPeer The initiators PeerInfo
 * @param {*} connection
 * @param {PeerId} remotePeerId This shouldn't be known
 * @param {Map<string, Crypto>} cryptos
 * @returns {[connection, string]} An encrypted connection and the tag of the `Crypto` used
 */
async function encryptInbound (localPeer, connection, cryptos) {
  const mss = new MSS.Listener(connection)
  const { stream, protocol } = await mss.handle(Array.from(cryptos.keys()))
  const crypto = cryptos.get(protocol)
  log('encrypting inbound connection...')
  const { conn, remotePeer } = await crypto.secureInbound(localPeer, stream)

  if (conn) return {
    conn,
    remotePeer,
    protocol
  }

  throw new Error('All encryption failed')
}

module.exports.encryptOutbound = encryptOutbound
module.exports.encryptInbound = encryptInbound
