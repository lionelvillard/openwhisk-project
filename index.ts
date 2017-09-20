/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

module.exports = {
    auth: require('./libs/auth'),
    deploy: require('./libs/deploy').default,
    undeploy: require('./libs/undeploy'),
    refresh: require('./libs/refresh.js'),
    sync: require('./libs/sync.js'),
    env: require('./libs/env.js'),
    yo: require('./libs/yo.js'),
    types: require('./libs/types'),
    names: require('./libs/names')
}