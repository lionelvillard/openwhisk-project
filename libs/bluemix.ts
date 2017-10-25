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
import * as parser from 'properties-parser';

// @return true if Bluemix with wsk plugin is available on this system, false otherwise
export const isBluemixCapable = async () => {
    if (process.env.BLUEMIX_API_KEY) {
        try {
            await exec('bx wsk help');
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
}

export interface Credential {
    endpoint?: string,
    apikey?: string,
    org?: string,
    space?: string,
    home?: string
}

const wskProps = (cred: Credential) => `${cred.home}/.wskprops`;

// Run bluemix command
export const run = async (config: types.Config, cred: Credential, cmd: string) => {
    cred = fixupCredentials(config, cred);
    const bx = `WSK_CONFIG_FILE=${wskProps(cred)} BLUEMIX_HOME=${cred.home} bx ${cmd}`;
    config.logger.debug(`exec ${bx}`);
    return await exec(bx);
}

// Login to Bluemix
export const login = async (config: types.Config, cred: Credential) => {
    cred = fixupCredentials(config, cred);
    try {
        const space = cred.space ? `-s ${cred.space}` : '';
        config.startProgress('login to Bluemix');
        try {
            await run(config, cred, 'target');
        } catch (e) {
            config.setProgress('refreshing Bluemix tokens');
            await run(config, cred, `login -a ${cred.endpoint} --apikey ${cred.apikey} -o ${cred.org} ${space}`);
        }
        config.terminateProgress();

        return true;
    } catch (e) {
        return false;
    }
}

// Install Cloud function plugin
export async function installWskPlugin(config: types.Config, cred: Credential) {
    try {
        await run(config, cred, 'wsk');
    } catch (e) {
        config.setProgress('installing IBM cloud function plugin');
        await run(config, cred, 'plugin install Cloud-Functions -r Bluemix');
    }
}

//
export function fixupCredentials(config: types.Config, cred: Credential) {
    cred = cred || {};
    cred.endpoint = cred.endpoint || 'api.ng.bluemix.net';
    cred.apikey = cred.apikey || process.env.BLUEMIX_API_KEY;
    if (!cred.apikey) {
        throw 'Cannot login to Bluemix: missing apikey';
    }
    if (!cred.org) {
        throw 'Cannot login to Bluemix: missing org';
    }
    if (!cred.space && !cred.home) {
        throw 'Cannot login to Bluemix: missing either space or home';
    }
    if (!cred.home) {
        cred.home = path.join(config.cache, '.bluemix', cred.endpoint, cred.org, cred.space);
    }
    return cred;
}

export async function ensureSpaceExists(config: types.Config, cred: Credential) {
    config.startProgress(`checking ${cred.space} space exists`);
    await run(config, cred, `account space-create ${cred.space}`); // fast when already exists
    await run(config, cred, `target -s ${cred.space}`);

    await installWskPlugin(config, cred);
    await refreshWskProps(config, cred, 5); // refresh .wskprops

    config.terminateProgress();
}

async function refreshWskProps(config: types.Config, cred: Credential, retries: number) {
    if (retries <= 0)
        config.fatal('unable to obtain wsk authentication key. try again later.');
    const io = await run(config, cred, 'wsk property get');
    if (io.stderr) {
        await new Promise(resolve => setTimeout(() => refreshWskProps(config, cred, retries - 1), 500));
    }
}

// Get Wsk AUTH and APIGW_ACCESS_TOKEN for given credential. If cred space does not exist, create it.
export async function getWskPropsForSpace(config: types.Config, cred: Credential) {
    config.startProgress('retrieving wsk authentication');
    await ensureSpaceExists(config, cred);
    config.terminateProgress();
    return parser.read(wskProps(cred));
}