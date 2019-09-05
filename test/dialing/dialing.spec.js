/* eslint-env mocha */
'use strict'

const { isNode } = require('../utils/constants')

describe('Dialing', () => {
  if (isNode) {
    require('./direct') // direct dials
  }
})
