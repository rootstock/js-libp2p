# Getting Started

Welcome to libp2p! This guide will walk you through setting up a fully functional libp2p node 🚀

- [Getting Started](#getting-started)
  - [Install](#install)
  - [Configuring libp2p](#configuring-libp2p)
    - [Basic setup](#basic-setup)
      - [Transports](#transports)
      - [Connection Encryption](#connection-encryption)
      - [Multiplexing](#multiplexing)
      - [Running Libp2p](#running-libp2p)
    - [Custom setup](#custom-setup)
      - [Peer Discovery](#peer-discovery)
      - [Pubsub](#pubsub)
  - [What is next](#what-is-next)

## Install

The first step is to install libp2p in your project:

```sh
npm install libp2p
```

## Configuring libp2p

If you're new to libp2p, we recommend configuring your node in stages, as this can make troubleshooting configuration issues much easier. In this guide, we'll do just that. If you're more experienced with libp2p, you may wish to jump to the [Configuration readme](./CONFIGURATION.md).

### Basic setup

Now that we have libp2p installed, let's configure the minimum needed to get your node running. The only modules libp2p requires are a [**Transport**][transport] and [**Crypto**][crypto] module. However, we recommend that a basic setup should also have a [**Stream Multiplexer**](streamMuxer) configured, which we will explain shortly. Let's start by setting up a Transport.

#### Transports

Libp2p uses Transports to establish connections between peers over the network. Transports are the components responsible for performing the actual exchange of data between libp2p nodes. You can configure any number of Transports, but you only need 1 to start with. Supporting more Transports will improve the ability of your node to speak to a larger number of nodes on the network, as matching Transports are required for two nodes to communicate with one another.

You should select Transports according to the runtime of your application; Node.js or the browser. You can see a list of some of the available Transports in the [configuration readme](./CONFIGURATION.md#transport). For this guide let's install `libp2p-websockets`, as it can be used in both Node.js and the browser.

Start by installing `libp2p-websockets`:

```sh
npm install libp2p-websockets
```

Now that we have the module installed, let's configure libp2p to use the Transport. We'll use the [`Libp2p.create`](./API.md#create) method, which takes a single configuration object as its only parameter. We can add the Transport by passing it into the `modules.transport` array:

```js
const Libp2p = require('libp2p')
const WebSockets = require('libp2p-websockets')

const node = await Libp2p.create({
  modules: {
    transport: [WebSockets]
  }
})
```

There are multiple libp2p transports available, you should evaluate the needs of your application and select the Transport(s) that best suit your requirements. You can add as many transports as you like to `modules.transport` in order to establish connections with as many peers as possible.

<details><summary>Read More</summary>
If you want to know more about libp2p transports, you should read the following content:

- https://docs.libp2p.io/concepts/transport
- https://github.com/libp2p/specs/tree/master/connections
</details>

#### Connection Encryption

Encryption is an important part of communicating on the libp2p network. Every connection must be encrypted to help ensure security for everyone. As such, Connection Encryption (Crypto) is a required component of libp2p.

There are a growing number of Crypto modules being developed for libp2p. As those are released they will be tracked in the [Connection Encryption section of the configuration readme](./CONFIGURATION.md#connection-encryption). For now, we are going to configure our node to use the `libp2p-secio` module, which is widely supported across the various libp2p implementations.

```sh
npm install libp2p-secio
```

With `libp2p-secio` installed, we can add it to our existing configuration by importing it and adding it to the `modules.connEncryption` array:

```js
const Libp2p = require('libp2p')
const WebSockets = require('libp2p-websockets')
const SECIO = require('libp2p-secio')

const node = await Libp2p.create({
  modules: {
    transport: [WebSockets],
    connEncryption: [SECIO]
  }
})
```

<details><summary>Read More</summary>
If you want to know more about libp2p connection encryption, you should read the following content:

- https://docs.libp2p.io/concepts/secure-comms
- https://github.com/libp2p/specs/tree/master/connections
</details>

#### Multiplexing

While multiplexers are not strictly required, they are highly recommended as they improve the effectiveness and efficiency of connections for the various protocols libp2p runs. Adding a multiplexer to your configuration will allow libp2p to run several of its internal protocols, like Identify, as well as allow your application to easily run any number of protocols over a single connection.

Looking at the [available stream multiplexing](./CONFIGURATION.md#stream-multiplexing) modules, js-libp2p currently only supports `libp2p-mplex`, so we will use that here. Bear in mind that future libp2p Transports might have `multiplexing` capabilities already built-in (such as `QUIC`).

You can install `libp2p-mplex` and add it to your libp2p node as follows in the next example.

```sh
npm install libp2p-mplex
```

```js
const Libp2p = require('libp2p')
const WebSockets = require('libp2p-websockets')
const SECIO = require('libp2p-secio')
const MPLEX = require('libp2p-mplex')

const node = await Libp2p.create({
  modules: {
    transport: [WebSockets],
    connEncryption: [SECIO],
    streamMuxer: [MPLEX]
  }
})
```

<details><summary>Read More</summary>
If you want to know more about libp2p stream multiplexing, you should read the following content:

- https://docs.libp2p.io/concepts/stream-multiplexing
- https://github.com/libp2p/specs/tree/master/connections
- https://github.com/libp2p/specs/tree/master/mplex
</details>

#### Running Libp2p

Now that you have configured a [**Transport**][transport], [**Crypto**][crypto] and [**Stream Multiplexer**](streamMuxer) module, you can start your libp2p node. We can start and stop libp2p using the [`libp2p.start()`](./API.md#start) and [`libp2p.stop()`](./API.md#stop) methods.

```js
const Libp2p = require('libp2p')
const WebSockets = require('libp2p-websockets')
const SECIO = require('libp2p-secio')
const MPLEX = require('libp2p-mplex')

const node = await Libp2p.create({
  modules: {
    transport: [WebSockets],
    connEncryption: [SECIO],
    streamMuxer: [MPLEX]
  }
})

// start libp2p
await node.start()
console.log('libp2p has started')

// stop libp2p
await node.stop()
console.log('libp2p has stopped')
```

### Custom setup

Once your libp2p node is running, it is time to get it connected to the public network. We can do this via peer discovery.

#### Peer Discovery

Peer discovery is an important part of creating a well connected libp2p node. A static list of peers will often be used to join the network, but it's useful to couple other discovery mechanisms to ensure you're able to discover other peers that are important to your application.

For each discovered peer libp2p will emit a `peer:discovery` event which includes metadata about that peer. You can read the [Events](./API.md#events) in the API doc to learn more.

Looking at the [available peer discovery](./CONFIGURATION.md#peer-discovery) protocols, there are several options to be considered:
- If you already know the addresses of some other network peers, you should consider using `libp2p-bootstrap` as this is the easiest way of getting your peer into the network.
- If it is likely that you will have other peers on your local network, `libp2p-mdns` is a must if you're node is not running in the browser. It allows peers to discover each other when on the same local network.
- If your application is browser based you can use the `libp2p-webrtc-star` Transport, which includes a rendezvous based peer sharing service.
- A random walk approach can be used via `libp2p-kad-dht`, to crawl the network and find new peers along the way.

For this guide we will configure `libp2p-bootstrap` as this is useful for joining the public network.

Let's install `libp2p-bootstrap`.

```sh
npm install libp2p-bootstrap
```

We can provide specific configurations for each protocol within a `config.peerDiscovery` property in the options as shown below.

```js
const Libp2p = require('libp2p')
const WebSockets = require('libp2p-websockets')
const SECIO = require('libp2p-secio')
const MPLEX = require('libp2p-mplex')

const Bootstrap = require('libp2p-bootstrap')

// Known peers addresses
const bootstrapMultiaddrs = [
  '/dns4/ams-1.bootstrap.libp2p.io/tcp/443/wss/p2p/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd',
  '/dns4/lon-1.bootstrap.libp2p.io/tcp/443/wss/p2p/QmSoLMeWqB7YGVLJN3pNLQpmmEk35v6wYtsMGLzSr5QBU3'
]

const node = await Libp2p.create({
  modules: {
    transport: [WebSockets],
    connEncryption: [SECIO],
    streamMuxer: [MPLEX],
    peerDiscovery: [Bootstrap]
  },
  config: {
    peerDiscovery: {
      autoDial: true, // Auto connect to discovered peers (limited by ConnectionManager minPeers)
      // The `tag` property will be searched when creating the instance of your Peer Discovery service.
      // The associated object, will be passed to the service when it is instantiated.
      [Bootstrap.tag]: {
        enabled: true,
        list: bootstrapMultiaddrs // provide array of multiaddrs
      }
    }
  }
})

node.on('peer:discovery', (peer) => {
  console.log('Discovered %s', peer.id.toB58String()) // Log discovered peer
})

node.on('peer:connect', (peer) => {
    console.log('Connected to %s', peer.id.toB58String()) // Log connected peer
  })

// start libp2p
await node.start()
```

<details><summary>Read More</summary>
If you want to know more about libp2p peer discovery, you should read the following content:

- https://github.com/libp2p/specs/blob/master/discovery/mdns.md
</details>

## What is next

There are a lot of other concepts within `libp2p`, that are not covered in this guide. For additional configuration options we recommend checking out the [Configuration Readme](./CONFIGURATION.md) and the [examples folder](../examples). If you have any problems getting started, or if anything isn't clear, please let us know by submitting an issue!


[transport]: https://github.com/libp2p/js-interfaces/tree/master/src/transport
[crypto]: https://github.com/libp2p/js-interfaces/tree/master/src/crypto
[streamMuxer]: https://github.com/libp2p/js-interfaces/tree/master/src/stream-muxer
