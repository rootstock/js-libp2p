'use strict'

const promisify = require('promisify-es6')
const mss = require('multistream-select')

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
    connection = await promisify(dialer.select, { context: dialer })(tag)

    return [connection, muxer.dialer(connection)]
  }

  throw new Error('All muxing failed')
}

module.exports = multiplex
