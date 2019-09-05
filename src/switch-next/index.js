'use strict'

const Multiaddr = require('multiaddr')
const OldSwitch = require('../switch')
const createFromB58String = require('peer-id').createFromB58String
const { getUpgrader } = require('./upgrader')
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

class Switch extends OldSwitch {
  constructor (peerInfo, peerBook, options) {
    super(peerInfo, peerBook, options)

    // TODO: maybe track these in a better place, we need to
    this.connections = new Map()
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
    const conn = await transportDial(transport, addr, upgrader)
    if (conn) {
      this.addConnection(conn.remotePeer.id.toB58String(), conn)
    }
    return conn
  }

  /**
   * Dials a given `PeerInfo` by dialing all of its known addresses.
   * The dial to the first address that is successfully able to upgrade a connection
   * will be used.
   *
   * @param {PeerInfo} peerInfo The address to dial
   * @returns {Connection}
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

  /**
   * @param {string} peerId
   * @returns {Connection}
   */
  getConnection (peerId) {
    return this.connections.get(peerId)
  }

  /**
   * @param {string} peerId
   * @param {Connection} connection
   */
  addConnection (peerId, connection) {
    this.connections.set(peerId, connection)
  }
}

module.exports = Switch
