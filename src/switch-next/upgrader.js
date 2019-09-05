'use strict'

const multiplex = require('./multiplex')
const encrypt = require('./encrypt')
const promisify = require('promisify-es6')

/**
 * @private
 * @param {object} options
 * @param {PeerInfo} options.localPeer
 * @param {Map<string, Crypto>} options.cryptos
 * @param {Map<string, Muxer>} options.muxers
 * @returns {function(connection)} A connection upgrade function that returns a Libp2p Connection
 */
function getUpgrader ({ localPeer, cryptos, muxers }) {
  return async (connection) => {
    const [eConn, cryptoTag] = await encrypt(localPeer, connection, cryptos)
    const [muxedConn, muxer] = await multiplex(eConn, muxers)
    const remotePeer = await promisify(eConn.getPeerInfo, { context: eConn })()

    // TODO: Create an actual Libp2p Connection
    return {
      conn: muxedConn,
      remotePeer,
      cryptoTag,
      muxer
    }
  }
}

module.exports.getUpgrader = getUpgrader
