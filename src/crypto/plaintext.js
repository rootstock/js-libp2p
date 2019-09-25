'use strict'

const protobuf = require('protons')
const protocol = '/plaintext/2.0.0'
const handshake = require('../util/to-reader-writer')
const lp = require('it-length-prefixed')
const pipe = require('it-pipe')
const PeerId = require('peer-id')
const debug = require('debug')
const log = debug('crypto:plaintext')
log.error = debug('error:crypto')

const {
  Exchange,
  KeyType
} = protobuf(`
message Exchange {
  optional bytes id = 1;
  optional PublicKey pubkey = 2;
}

enum KeyType {
	RSA = 0;
	Ed25519 = 1;
	Secp256k1 = 2;
	ECDSA = 3;
}

message PublicKey {
	required KeyType Type = 1;
	required bytes Data = 2;
}
`)

function lpEncodeExchange (exchange) {
  const pb = Exchange.encode(exchange)
  return lp.encode.single(pb)
}

async function encrypt (localId, conn, remoteId) {
  const { reader, writer, rest } = handshake(conn)

  writer.push(lpEncodeExchange({
    id: localId.toBytes(),
    pubkey: {
      Type: KeyType.RSA, // TODO: dont hard code
      Data: localId.marshalPubKey()
    }
  }))

  log('write pubkey exchange to peer %j', remoteId)

  // Get the Exchange message
  const response = (await lp.decodeFromReader(reader).next()).value
  const id = Exchange.decode(response.slice())
  log('read pubkey exchange from peer %j', remoteId)

  if (!id || !id.pubkey) {
    throw new Error('Remote did not provide their public key')
  }

  const peerId = await PeerId.createFromPubKey(id.pubkey.Data)

  if (remoteId && !peerId.isEqual(remoteId)) {
    throw new Error('Remote peer id does not match known target id')
  }

  log('crypto exchange completed successfully: %j', peerId)

  writer.end()
  return {
    conn: rest,
    remotePeer: peerId
  }
}

module.exports = {
  tag: protocol,
  secureInbound: async (localId, conn) => {
    return encrypt(localId, conn, null)
  },
  secureOutbound: async (localId, conn, remoteId) =>  {
    return encrypt(localId, conn, remoteId)
  }
}
