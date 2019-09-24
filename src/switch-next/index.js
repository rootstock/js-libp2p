'use strict'

const Multiaddr = require('multiaddr')
const OldSwitch = require('../switch')
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
 * @returns {Connection} A Libp2p Connection
 */
async function transportDial (transport, address) {
  // TODO: Add abort controller
  return transport.dial(address, {})
}

function inboundConnectionHandler (key) {
  return (connection) => {
    console.log('Incoming Connection (%s) on %s', connection.id, key)
  }
}

class Switch extends OldSwitch {
  constructor (peerInfo, peerBook, options) {
    super(peerInfo, peerBook, options)

    // TODO: maybe track these in a better place, we need to
    this.connections = new Map()
    this._connectionHandler = inboundConnectionHandler
  }

  /**
   * Dials a given `Multiaddr`. `addr` should include the id of the peer being
   * dialed, it will be used for encryption verification.
   *
   * @param {Multiaddr} addr The address to dial
   */
  async dialAddress (addr) {
    addr = Multiaddr(addr)
    const transport = transportForAddress(addr, Object.values(this.transports))
    if (!transport) {
      log.error('no valid transport for %s', addr)
      throw new Error('No transport available for address')
    }
    const conn = await transportDial(transport, addr)
    if (conn) {
      // this.addConnection(conn.remotePeer.id.toB58String(), conn)
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
   * @returns {Upgrader}
   */
  getUpgrader () {
    // TODO: Make it so the upgrader can be modified later
    // This would enable users to manage how connections are upgraded
    return getUpgrader({
      localPeer: this._peerInfo,
      cryptos: this.cryptos,
      muxers: this.muxers
    })
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
