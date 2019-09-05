'use strict'

const debug = require('debug')
const log = debug('dial')
log.error = debug('error:dial')
const promisify = require('promisify-es6')
const mss = require('multistream-select')

function asyncCrypto (crypto, localPeer, connection, remotePeerId) {
  return new Promise((resolve, reject) => {
    const eConn = crypto(localPeer.id, connection, remotePeerId, (err) => {
      if (err) return reject(err)
      resolve(eConn)
    })
  }).catch(log.error)
}

/**
 * Attempts to encrypt the given `connection` with the provided `cryptos`.
 * The first `Crypto` module to succeed will be used
 * @private
 * @async
 * @param {PeerInfo} localPeer The initiators PeerInfo
 * @param {*} connection
 * @param {Map<string, Crypto>} cryptos
 * @returns {[connection, string]} An encrypted connection and the tag of the `Crypto` used
 */
async function encrypt (localPeer, connection, cryptos) {
  const remotePeerId = connection.remotePeerId
  for (const [tag, crypto] of cryptos) {
    // MSS Selection
    const dialer = new mss.Dialer()
    await promisify(dialer.handle, { context: dialer })(connection)
    connection = await promisify(dialer.select, { context: dialer })(tag)

    // Do Crypto
    const conn = await asyncCrypto(crypto, localPeer, connection, remotePeerId)
    if (conn) return [conn, tag]
  }

  throw new Error('All encryption failed')
}

module.exports = encrypt
