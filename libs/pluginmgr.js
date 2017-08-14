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

// Simple plugins manager
const fs = require('fs')
const path = require('path')

const actionPlugins = {}
const RESERVED_ACTION_KEYWORDS = ['location', 'code', 'limits', 'inputs', 'kind', 'zip', 'annotations', 'sequence', 'extra']

// Build plugin index.
const init = context => {
    return loadDescs(context, './plugins/actions')
}
exports.init = init

const loadDescs = (context, dir) => new Promise((resolve, reject) => {
    const root = path.join(__dirname, '..', dir)
    fs.readdir(root, (err, files) => {
        if (err)
            return reject(err)

        for (const file of files) {
            if (!RESERVED_ACTION_KEYWORDS.includes(file))
                actionPlugins[file] = path.join(root, file)
            else
                context.logger.warn(`Skipping ${file}: it is a reserved plugin name`)
        }

        resolve()
    })
})

const getActionPlugin = action => {
    for (const name in actionPlugins) {
        if (action.hasOwnProperty(name)) {
            const plugin = require(actionPlugins[name])
            plugin.__pluginName = name
            return plugin
        }
    }
    return null
}
exports.getActionPlugin = getActionPlugin
