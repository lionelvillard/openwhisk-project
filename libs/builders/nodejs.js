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
const path = require('path')
const fse = require('fs-extra')
const fs = require('fs')
const {exec} = require('child_process')
const utils = require('../utils')

// Gets the kind(s) of actions this builder supports.
const supportedKinds = () => ([
    'nodejs:*'
])

exports.supportedKinds = supportedKinds

/*
 Nodejs builder

 @param {Object} args
 @param {Object} args.target        - where to save built artifacts
 @param {Object} args.action        - the action descriptor

 @return A promise resolving to the location of the main built artifact.
 */
const buildNodeJS = args => {
    const location = args.action.location
    if (!args.action.zip)
        return Promise.resolve(location)

    // Directory structure
    // + target
    //     + src
    //     file.zip
    const baseLoc = path.dirname(location)

    const baseLocInCache = args.target
    const srcLocInCache = path.join(baseLocInCache, '/src')
    const ziplocInCache = path.join(baseLocInCache, 'action.zip')

    const copyOptions = {
        preserveTimestamps: true,
        filter: src => {
            const basename = path.basename(src)
            //console.log(src)

            // TODO: read .npmignore

            return true
        }
    }

    return fse.mkdirs(`${baseLocInCache}/src`)
        .then(() => fse.copy(baseLoc, srcLocInCache, copyOptions))
        .then(npmInstall(srcLocInCache))
        .then(() => utils.zip(ziplocInCache, srcLocInCache))
        .then(() => ziplocInCache)
}
exports.build = buildNodeJS

const npmInstall = src => () => new Promise((resolve, reject) => {

    const execOptions = {
        cwd: src
    }

    // see https://github.com/npm/npm/pull/7249 for extra etc directory

    exec(`npm  install --production --prefix .`, execOptions, error => {
            if (error)
                return reject(error)
            resolve()
        }
    )
})
