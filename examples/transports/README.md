# [Transports](http://libp2p.io/implementations/#transports)

libp2p doesn't make assumptions for you, instead, it enables you as the developer of the application to pick the modules you need to run your application, which can vary depending on the runtime you are executing. A libp2p node can use one or more Transports to dial and listen for Connections. These transports are modules that offer a clean interface for dialing and listening, defined by the [interface-transport](https://github.com/libp2p/js-interfaces/tree/master/src/transport) specification. Some examples of possible transports are: TCP, UTP, WebRTC, QUIC, HTTP, Pigeon and so on.

A more complete definition of what is a transport can be found on the [interface-transport](https://github.com/libp2p/js-interfaces/tree/master/src/transport) specification. A way to recognize a candidate transport is through the badge:

[![](https://raw.githubusercontent.com/diasdavid/interface-transport/master/img/badge.png)](https://raw.githubusercontent.com/diasdavid/interface-transport/master/img/badge.png)

## 1. Creating a libp2p node with TCP

When using libp2p, you need properly configure it, that is, pick your set of modules and create your network stack with the properties you need. In this example, we will create a libp2p node TCP. You can find the complete solution on the file [1.js](./1.js).

You will need 4 dependencies total, so go ahead and install all of them with:

```bash
> npm install libp2p libp2p-tcp libp2p-secio peer-info
```

Then, on your favorite text editor create a file with the `.js` extension. I've called mine `1.js`.

First thing is to create our own libp2p node! Insert:

```JavaScript
'use strict'

const Libp2p = require('libp2p')
const TCP = require('libp2p-tcp')
const SECIO = require('libp2p-secio')

const createNode = async (peerInfo) => {
  // To signall the addresses we want to be available, we use
  // the multiaddr format, a self describable address
  peerInfo.multiaddrs.add('/ip4/0.0.0.0/tcp/0')

  const node = await Libp2p.create({
    peerInfo,
    modules: {
      transport: [ TCP ],
      connEncryption: [ SECIO ]
    }
  })

  await node.start()
  return node
}
```

Now that we have a function to create our own libp2p node, let's create a node with it.

```JavaScript
const peerInfo = await PeerInfo.create()
const node = await createNode(peerInfo)

// At this point the node has started
console.log('node has started (true/false):', node.isStarted())
// And we can print the now listening addresses.
// If you are familiar with TCP, you might have noticed
// that we specified the node to listen in 0.0.0.0 and port
// 0, which means "listen in any network interface and pick
// a port for me
console.log('listening on:')
node.peerInfo.multiaddrs.forEach((ma) => console.log(ma.toString()))
```

Running this should result in something like:

```bash
> node 1.js
node has started (true/false): true
listening on:
/ip4/127.0.0.1/tcp/61329/p2p/QmW2cKTakTYqbQkUzBTEGXgWYFj1YEPeUndE1YWs6CBzDQ
/ip4/192.168.2.156/tcp/61329/p2p/QmW2cKTakTYqbQkUzBTEGXgWYFj1YEPeUndE1YWs6CBzDQ
```

That `QmW2cKTakTYqbQkUzBTEGXgWYFj1YEPeUndE1YWs6CBzDQ` is the PeerId that was created during the PeerInfo generation.

## 2. Dialing from one node to another node

Now that we have our `createNode` function, let's create two nodes and make them dial to each other! You can find the complete solution at [2.js](./2.js).

For this step, we will need one more dependency.

```bash
> npm install it-pipe it-buffer
```

And we also need to import the module on our .js file:

```js
const pipe = require('it-pipe')
const { toBuffer } = require('it-buffer')
```

We are going to reuse the `createNode` function from step 1, but this time to make things simpler, we will create another function to print the addrs to avoid duplicating code.

```JavaScript
function printAddrs (node, number) {
  console.log('node %s is listening on:', number)
  node.peerInfo.multiaddrs.forEach((ma) => console.log(ma.toString()))
}
```

Then,

```js
;(async () => {
  const [peerInfo1, peerInfo2] = await Promise.all([
    PeerInfo.create(),
    PeerInfo.create()
  ])
  const [node1, node2] = await Promise.all([
    createNode(),
    createNode()
  ])

  printAddrs(node1, '1')
  printAddrs(node2, '2')

  node2.handle('/print', ({ stream }) => {
    pipe(
      stream,
      async function (source) {
        for await (const msg of source) {
          console.log(msg.toString())
        }
      }
    )
  })

  const { stream } = await node1.dialProtocol(node2.peerInfo, '/print')

  await pipe(
    ['Hello', ' ', 'p2p', ' ', 'world', '!'],
    stream
  )
})();
```

The result should be look like:

```bash
> node 2.js
node 1 is listening on:
/ip4/127.0.0.1/tcp/62279/p2p/QmeM4wNWv1uci7UJjUXZYfvcy9uqAbw7G9icuxdqy88Mj9
/ip4/192.168.2.156/tcp/62279/p2p/QmeM4wNWv1uci7UJjUXZYfvcy9uqAbw7G9icuxdqy88Mj9
node 2 is listening on:
/ip4/127.0.0.1/tcp/62278/p2p/QmWp58xJgzbouNJcyiNNTpZuqQCJU8jf6ixc7TZT9xEZhV
/ip4/192.168.2.156/tcp/62278/p2p/QmWp58xJgzbouNJcyiNNTpZuqQCJU8jf6ixc7TZT9xEZhV
Hello p2p world!
```

## 3. Using multiple transports

Next, we want to be available in multiple transports to increase our chances of having common transports in the network. A simple scenario, a node running in the browser only has access to HTTP, WebSockets and WebRTC since the browser doesn't let you open any other kind of transport, for this node to dial to some other node, that other node needs to share a common transport.

What we are going to do in this step is to create 3 nodes, one with TCP, another with TCP+WebSockets and another one with just WebSockets. The full solution can be found on [3.js](./3.js).

In this example, we will need to also install `libp2p-websockets`, go ahead and install:

```bash
> npm install libp2p-websockets
```

We want to create 3 nodes, one with TCP, one with TCP+WebSockets and one with just WebSockets. We need to update our `createNode` function to contemplate WebSockets as well. Moreover, let's upgrade our function to enable us to pick the addrs in which a node will start a listener:

```JavaScript
// ...

const createNode = async (peerInfo, transports, multiaddrs = []) => {
  if (!Array.isArray(multiaddrs)) {
    multiaddrs = [multiaddrs]
  }

  multiaddrs.forEach((addr) => peerInfo.multiaddrs.add(addr))

  const node = await Libp2p.create({
    peerInfo,
    modules: {
      transport: transports,
      connEncryption: [ SECIO ]
    }
  })

  await node.start()
  return node
}
```

As a rule, a libp2p node will only be capable of using a transport if: a) it has the module for it and b) it was given a multiaddr to listen on. The only exception to this rule is WebSockets in the browser, where a node can dial out, but unfortunately cannot open a socket.

Let's update our flow to create nodes and see how they behave when dialing to each other:

```JavaScript
const WebSockets = require('libp2p-websockets')
const TCP = require('libp2p-tcp')

const [peerInfo1, peerInfo2, peerInfo3] = await Promise.all([
  PeerInfo.create(),
  PeerInfo.create(),
  PeerInfo.create()
])
const [node1, node2, node3] = await Promise.all([
  createNode(peerInfo1, [TCP], '/ip4/0.0.0.0/tcp/0'),
  createNode(peerInfo2, [TCP, WebSockets], ['/ip4/0.0.0.0/tcp/0', '/ip4/127.0.0.1/tcp/10000/ws']),
  createNode(peerInfo3, [WebSockets], '/ip4/127.0.0.1/tcp/20000/ws')
])

printAddrs(node1, '1')
printAddrs(node2, '2')
printAddrs(node3, '3')

node1.handle('/print', print)
node2.handle('/print', print)
node3.handle('/print', print)

// node 1 (TCP) dials to node 2 (TCP+WebSockets)
const { stream } = await node1.dialProtocol(node2.peerInfo, '/print')
await pipe(
  ['node 1 dialed to node 2 successfully'],
  stream
)

// node 2 (TCP+WebSockets) dials to node 2 (WebSockets)
const { stream: stream2 } = await node2.dialProtocol(node3.peerInfo, '/print')
await pipe(
  ['node 2 dialed to node 3 successfully'],
  stream2
)

// node 3 (WebSockets) attempts to dial to node 1 (TCP)
try {
  await node3.dialProtocol(node1.peerInfo, '/print')
} catch (err) {
  console.log('node 3 failed to dial to node 1 with:', err.message)
}
```

`print` is a function created using the code from 2.js, but factored into its own function to save lines, here it is:

```JavaScript
function print ({ stream }) {
  pipe(
    stream,
    async function (source) {
      for await (const msg of source) {
        console.log(msg.toString())
      }
    }
  )
}
```

If everything was set correctly, you now should see the following after you run the script:

```Bash
> node 3.js
node 1 is listening on:
/ip4/127.0.0.1/tcp/62620/p2p/QmWpWmcVJkF6EpmAaVDauku8g1uFGuxPsGP35XZp9GYEqs
/ip4/192.168.2.156/tcp/62620/p2p/QmWpWmcVJkF6EpmAaVDauku8g1uFGuxPsGP35XZp9GYEqs
node 2 is listening on:
/ip4/127.0.0.1/tcp/10000/ws/p2p/QmWAQtWdzWXibgfyc7WRHhhv6MdqVKzXvyfSTnN2aAvixX
/ip4/127.0.0.1/tcp/62619/p2p/QmWAQtWdzWXibgfyc7WRHhhv6MdqVKzXvyfSTnN2aAvixX
/ip4/192.168.2.156/tcp/62619/p2p/QmWAQtWdzWXibgfyc7WRHhhv6MdqVKzXvyfSTnN2aAvixX
node 3 is listening on:
/ip4/127.0.0.1/tcp/20000/ws/p2p/QmVq1PWh3VSDYdFqYMtqp4YQyXcrH27N7968tGdM1VQPj1
node 1 dialed to node 2 successfully
node 2 dialed to node 3 successfully
node 3 failed to dial to node 1 with:
    Error: No transport available for address /ip4/127.0.0.1/tcp/51482
```

As expected, we created 3 nodes, node 1 with TCP, node 2 with TCP+WebSockets and node 3 with just WebSockets. node 1 -> node 2 and node 2 -> node 3 managed to dial correctly because they shared a common transport, however, node 3 -> node 1 failed because they didn't share any.

## 4. How to create a new libp2p transport

Today there are already several transports available and plenty to come, you can find these at [interface-transport implementations](https://github.com/libp2p/js-interfaces/tree/master/src/transport#modules-that-implement-the-interface) list.

Adding more transports is done through the same way as you added TCP and WebSockets. Some transports might offer extra functionalities, but as far as libp2p is concerned, if it follows the interface defined at the [spec](https://github.com/libp2p/js-interfaces/tree/master/src/transport#api) it will be able to use it.

If you decide to implement a transport yourself, please consider adding to the list so that others can use it as well.

Hope this tutorial was useful. We are always looking to improve it, so contributions are welcome!
