'use strict'

const TCP = require('libp2p-tcp')
const MPLEX = require('libp2p-mplex')
const Secio = require('libp2p-secio')
const Plaintext = require('../../src/crypto/plaintext')
const defaultsDeep = require('@nodeutils/defaults-deep')
const libp2p = require('../../src')

class Node extends libp2p {
  constructor (_options) {
    const defaults = {
      modules: {
        transport: [TCP],
        streamMuxer: [MPLEX],
        connEncryption: [Secio],
        peerDiscovery: []
      },
      config: {
        peerDiscovery: {
          autoDial: false
        },
        relay: {
          enabled: false,
          hop: {
            enabled: false,
            active: false
          }
        }
      }
    }

    super(defaultsDeep(_options, defaults))
  }
}

module.exports = Node
