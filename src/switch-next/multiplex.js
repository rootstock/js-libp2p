'use strict'

const MSS = require('multistream-select')
const debug = require('debug')
const log = debug('dial')
log.error = debug('error:dial')

/**
 *
 * @private
 * @async
 * @param {*} connection A basic duplex connection to multiplex
 * @param {Map<string, Muxer>} muxers The muxers to attempt multiplexing with
 * @returns {MuxedConnection} A muxed connection
 */
async function multiplexOutbound (connection, muxers) {
  const dialer = new MSS.Dialer(connection)
  const protocols = Array.from(muxers.keys())
  log('outbound selecting muxer %s', protocols)
  const { stream, protocol } = await dialer.select(protocols)
  log('%s selected as muxer protocol', protocol)
  const Muxer = muxers.get(protocol)

  if (stream) return { stream, Muxer }

  throw new Error('All muxing failed')
}

/**
 *
 * @private
 * @async
 * @param {*} connection A basic duplex connection to multiplex
 * @param {Map<string, Muxer>} muxers The muxers to attempt multiplexing with
 * @returns {MuxedConnection} A muxed connection
 */
async function multiplexInbound (connection, muxers) {
  const listener = new MSS.Listener(connection)
  const protocols = Array.from(muxers.keys())
  log('inbound handling muxers %s', protocols)
  const { stream, protocol } = await listener.handle(protocols)
  const Muxer = muxers.get(protocol)

  if (stream) return { stream, Muxer }

  throw new Error('All muxing failed')
}

module.exports = {
  multiplexInbound,
  multiplexOutbound
}
