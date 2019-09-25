'use strict'

const {
  multiplexInbound,
  multiplexOutbound
} = require('./multiplex')
const { encryptInbound, encryptOutbound } = require('./encrypt')
const createFromB58String = require('peer-id').createFromB58String
const pipe = require('it-pipe')
const { Connection } = require('interface-connection')
const MSS = require('multistream-select')
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
    this.protocols = new Map()
  }

  /**
   *
   * @param {MultiaddrConnection} param0
   */
  async upgradeOutbound (maConn) {
    const { source, sink, conn, remoteAddr } = maConn
    let remotePeerId
    try {
      remotePeerId = createFromB58String(remoteAddr.getPeerId())
    } catch (err) {
      log.debug(err)
    }

    const cryptoResult = await encryptOutbound(this.localPeer.id, { source, sink }, remotePeerId, this.cryptos)
    const { stream, Muxer } = await multiplexOutbound(cryptoResult.conn, this.muxers)

    const muxer = new Muxer({
      onStream: async muxedStream => {
        const mss = new MSS.Listener(muxedStream)
        const { stream, protocol } = await mss.handle(this._protocols)
        log('outbound: new stream requested %s', protocol)
        connection.addStream(stream, protocol)
        this._onStream({ stream, protocol })
      },
      onStreamEnd: muxedStream => {
        connection.removeStream(muxedStream.id)
      }
    })

    const newStream = async protocols => {
      log('outbound: starting new stream on %s', protocols)
      const muxedStream = muxer.newStream()
      const mss = new MSS.Dialer(muxedStream)
      const { stream, protocol } = await mss.select(protocols)
      return { stream: { ...muxedStream, ...stream }, protocol }
    }

    pipe(stream, muxer, stream)

    const connection = new Connection({
      localAddr: maConn.localAddr,
      remoteAddr,
      localPeer: this.localPeer.id,
      remotePeer: cryptoResult.remotePeer,
      stat: {
        direction: 'outbound',
        timeline: {
          open: maConn.timeline.open,
          upgraded: Date.now(),
        },
        multiplexer: '/mplex/', // TODO: Actually set this
        encryption: '/plaintext/' // TODO: Actually set this
      },
      newStream,
      getStreams: () => muxer.streams,
      close: err => maConn.close(err)
    })

    return connection
  }

  _onStream({ stream, protocol }) {
    const handler = this.protocols.get(protocol)
    handler(stream)
  }

  async upgradeInbound (maConn) {
    const { source, sink, conn, remoteAddr } = maConn
    const cryptoResult = await encryptInbound(this.localPeer.id, { source, sink }, this.cryptos)
    const { stream, Muxer } = await multiplexInbound(cryptoResult.conn, this.muxers)

    // TODO: this is a test hack, the protocol should be set via `libp2p.handle`
    // and we need to set/proxy to `this.protocols`
    this.protocols.set('/echo/1.0.0', (stream) => {
      pipe(stream, stream)
    })

    const muxer = new Muxer({
      onStream: async muxedStream => {
        const mss = new MSS.Listener(muxedStream)
        const { stream, protocol } = await mss.handle([ '/echo/1.0.0' ])
        log('inbound: new stream requested', protocol)
        connection.addStream(stream, protocol)
        this._onStream({ stream, protocol })
      },
      onStreamEnd: muxedStream => {
        connection.removeStream(muxedStream.id)
      }
    })

    const newStream = async protocols => {
      log('inbound: starting new stream on %s', protocols)
      const muxedStream = muxer.newStream()
      const mss = new MSS.Dialer(muxedStream)
      const { stream, protocol } = await mss.select(protocols)
      return { stream: { conn, ...stream }, protocol }
    }

    pipe(stream, muxer, stream)

    const connection = new Connection({
      localAddr: maConn.localAddr,
      remoteAddr,
      localPeer: this.localPeer.id,
      remotePeer: cryptoResult.remotePeer,
      stat: {
        direction: 'inbound',
        timeline: {
          open: maConn.timeline.open,
          upgraded: Date.now(),
        },
        multiplexer: '/mplex/', // TODO: Actually set this
        encryption: '/plaintext/' // TODO: Actually set this
      },
      newStream,
      getStreams: () => muxer.streams,
      close: err => maConn.close(err)
    })

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
