/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
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
import * as request from 'request-promise';
import * as expandHomeDir from 'expand-home-dir';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child-process-promise';
import * as types from './types';

// @return true if Bluemix is available on this system, false otherwise
export const isBluemixCapable = async () => {
    if (process.env.BLUEMIX_API_KEY) {
        try {
            exec('bx help');
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
}

export interface Credential {
    endpoint?: string,
    key?: string,
    org?: string,
    space?: string,
    home?: string
}

// Login to Bluemix
export const login = async (config: types.Config, cred: Credential) => {
    cred = fixupCredentials(config, cred);
    try {
        const space = cred.space ? `-s ${cred.space}` : '';
        const bx = `BLUEMIX_HOME=${cred.home} bx login -a ${cred.endpoint} --apikey ${cred.key} -o ${cred.org} ${space}`;
        config.logger.debug(`exec ${bx}`);
        await exec(bx);
        return true;
    } catch (e) {
        return false;
    }
}

// Run bluemix command
export const run = async (config: types.Config, cred: Credential, cmd: string) => {
    const bx = `BLUEMIX_HOME=${cred.home} bx ${cmd}`;
    cred = fixupCredentials(config, cred);
    config.logger.debug(`exec ${bx}`);
    return await exec(bx);
}

const fixupCredentials = (config: types.Config, cred: Credential) => {
    cred = cred || {};
    cred.endpoint = cred.endpoint || 'api.ng.bluemix.net';
    cred.key = cred.key || process.env.BLUEMIX_API_KEY;
    if (!cred.key) {
        throw 'Cannot login to Bluemix: missing apikey';
    }
    if (!cred.org) {
        throw 'Cannot login to Bluemix: missing org';
    }
    if (!cred.space && !cred.home) {
        throw 'Cannot login to Bluemix: missing either space or home';
    }
    if (!cred.home) {
        cred.home = path.join(config.cache, 'bluemix', cred.endpoint, cred.org, cred.space);
    }
    return cred;
}

// Retrieve authentication tokens from local file system
export const getTokens = () => {
    let configFile = expandHomeDir('~/.bluemix/.cf/config.json')
    if (!fs.existsSync(configFile)) {
        configFile = expandHomeDir('~/.cf/config.json')
        if (!fs.existsSync(configFile)) {
            return null
        }
    }

    const config = require(configFile)
    if (!config.AccessToken)
        return null

    return {
        accessToken: config.AccessToken,
        refreshToken: config.RefreshToken
    }
}

// Send request to get all OpenWhisk keys for the given Bluemix authentication
export const getAuthKeys = (accessToken, refreshToken) => {
    return request({
        method: 'POST',
        uri: 'https://openwhisk.ng.bluemix.net/bluemix/v2/authenticate',
        body: {
            accessToken: accessToken.substr(7),
            refreshToken
        },
        json: true
    })
}

const delay = ms => new Promise(resolve => {
    setTimeout(resolve, ms)
})

/*
 Wait for the given spaces to be available in OpenWhisk

 @return {Object[]} the list of keys for the given spaces
 */
export const waitForAuthKeys = (accessToken, refreshToken, spaces, timeout = 1000) => {
    if (spaces.length == 0)
        return Promise.resolve(true)

    if (timeout < 0)
        return Promise.reject(new Error('timeout'))

    timeout = (timeout === undefined) ? 10000 : timeout

    return getAuthKeys(accessToken, refreshToken)
        .then(keys => {
            const namespaces = keys.namespaces
            let spacekeys = []
            for (const ns of namespaces) {

                for (const s of spaces) {

                    if (ns.name.endsWith(`_${s}`)) {
                        spacekeys.push(ns)
                        break
                    }
                }
            }

            if (spacekeys.length == spaces.length) {
                // got all.
                return Promise.resolve(spacekeys)
            } else {
                // Try again in a bit
                return delay(1000).then(() => waitForAuthKeys(accessToken, refreshToken, spaces, timeout - 1000))
            }
        }
        )
        .catch(e => {
            if ((e instanceof Error) && e.message === 'timeout')
                return Promise.reject(e)

            // most likely a 409. Try again.
            return delay(1000).then(() => waitForAuthKeys(accessToken, refreshToken, spaces, timeout - 1000))
        })
}

export const createSpace = space => {
    const tokens = getTokens()
    return new Promise((resolve, reject) => {
        exec(`bx iam space-create ${space}`, (err, stdout, stderr) => {
            if (err) {
                console.log(stdout)
                console.log(stderr)
                return reject(err)
            }
            return resolve(true)
        })
    })
        .then(() => waitForAuthKeys(tokens.accessToken, tokens.refreshToken, [space]))
        .then(keys => (keys && keys.length > 0) ? keys[0] : null)
}

export const deleteSpace = space => {
    return new Promise(resolve => {
        exec(`bx iam space-delete ${space} -f`, () => {
            return resolve(true)
        })
    })
}
