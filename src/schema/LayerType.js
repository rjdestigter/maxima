/**
 * Node.js API Starter Kit (https://reactstarter.com/nodejs)
 *
 * Copyright © 2016-present Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

/* @flow */

import {
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLString,
  GraphQLBoolean,
} from 'graphql';

export default new GraphQLObjectType({
  name: 'Layer',

  fields: {
    id: { type: new GraphQLNonNull(GraphQLInt) },
    url: { type: GraphQLString },
    label: { type: GraphQLString },
    date_created: { type: GraphQLString },
    imagery_date: { type: GraphQLString },
    imagery_end_date: { type: GraphQLString },
    srcType: { type: GraphQLString },
    layerType: { type: GraphQLString },
    category: { type: GraphQLString },
    source: { type: GraphQLString },
    bounds: { type: GraphQLString },
    yield_default: { type: GraphQLBoolean },
    asset: { type: new GraphQLNonNull(GraphQLInt) },
  },
});
