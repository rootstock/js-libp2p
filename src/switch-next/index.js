'use strict'

const Multiaddr = require('multiaddr')
const OldSwitch = require('../switch')
const promisify = require('promisify-es6')
const mss = require('multistream-select')
const createFromB58String = require('peer-id').createFromB58String
const debug = require('debug')
const log = debug('dial')
log.error = debug('error:dial')

/**
 * @private
 * @param {Multiaddr} address
 * @param {Transport[]} transports
 * @returns {Transport}
 */
function transportForAddress (address, transports) {
  return transports.find((transport) => {
    return Boolean(transport.filter([address]).length)
  })
}

/**
 * @private
 * @async
 * @param {*} transport
 * @param {Multiaddr} address
 * @param {function(connection)} upgrader A function that upgrades a basic connection to a Libp2p Connection
 * @returns {Connection} A Libp2p Connection
 */
async function transportDial (transport, address, upgrader) {
  const connection = await new Promise((resolve, reject) => {
    const conn = transport.dial(address, {}, (err) => {
      if (err) return reject(err)
      resolve(conn)
    })
  })

  connection.remotePeerId = createFromB58String(address.getPeerId())

  return upgrader(connection)
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
  for (const [tag, encrypt] of cryptos) {
    // MSS Selection
    const dialer = new mss.Dialer()
    await promisify(dialer.handle, { context: dialer })(connection)
    connection = await promisify(dialer.select, { context: dialer})(tag)

    // Do Crypto
    const conn = await new Promise((resolve, reject) => {
      const eConn = encrypt(localPeer.id, connection, remotePeerId, (err) => {
        if (err) return reject(err)
        resolve(eConn)
      })
    }).catch(log.error)

    if (conn) return [conn, tag]
  }

  throw new Error('All encryption failed')
}

/**
 *
 * @private
 * @async
 * @param {*} connection A basic duplex connection to multiplex
 * @param {Map<string, Muxer>} muxers The muxers to attempt multiplexing with
 * @returns {[connection, string]} A muxed connection and the tag of the `Muxer` used
 */
async function multiplex (connection, muxers) {
  for (const [tag, muxer] of muxers) {
    // MSS Selection
    const dialer = new mss.Dialer()
    await promisify(dialer.handle, { context: dialer })(connection)
    connection = await promisify(dialer.select, { context: dialer})(tag)

    return [connection, muxer.dialer(connection)]
  }

  throw new Error('All muxing failed')
}

/**
 * @private
 * @param {object} options
 * @param {PeerInfo} options.localPeer
 * @param {Map<string, Crypto>} options.cryptos
 * @param {Map<string, Muxer>} options.muxers
 * @returns {async function(connection)} A connection upgrade function that returns a Libp2p Connection
 */
function getUpgrader ({ localPeer, cryptos, muxers }) {
  return async (connection) => {
    const [eConn, cryptoTag] = await encrypt(localPeer, connection, cryptos)
    const [muxedConn, muxer] = await multiplex(eConn, muxers)

    // TODO: Create an actual Libp2p Connection
    return {
      conn: muxedConn,
      cryptoTag,
      muxer
    }
  }
}

class Switch extends OldSwitch {
  constructor (peerInfo, peerBook, options) {
    super(peerInfo, peerBook, options)
  }

  /**
   * Dials a given `Multiaddr`. `addr` should include the id of the peer being
   * dialed, it will be used for encryption verification.
   *
   * @param {Multiaddr} addr The address to dial
   */
  async dialAddress (addr) {
    addr = Multiaddr(addr)
    const upgrader = getUpgrader({
      localPeer: this._peerInfo,
      cryptos: this.cryptos,
      muxers: new Map(Object.keys(this.muxers).map(k => [k, this.muxers[k]]))
    })
    const transport = transportForAddress(addr, Object.values(this.transports))
    return transportDial(transport, addr, upgrader)
  }

  /**
   * Dials a given `PeerInfo` by dialing all of its known addresses.
   * The dial to the first address that is successfully able to upgrade a connection
   * will be used.
   *
   * @param {Multiaddr} addr The address to dial
   */
  async dialPeer (peerInfo) {
    const addrs = peerInfo.multiaddrs.toArray()
    // TODO: Send this through the Queue or Limit Dialer
    for (const addr of addrs) {
      const conn = await this.dialAddress(addr)
        .catch(log.error)
      if (conn) return conn
    }

    throw new Error('Could not dial peer, all addresses failed')
  }
}

module.exports = Switch
