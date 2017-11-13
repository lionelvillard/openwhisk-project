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
import { delay } from './utils';
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

export type Credential = ICredential;
export interface ICredential {
    endpoint?: string;
    apikey?: string;
    org?: string;
    space?: string;
    home?: string;
}

const wskProps = (cred: Credential) => `${cred.home}/.wskprops`;

// Run bluemix command. Retries once if not logged in.
export async function run(config: types.Config, cred: Credential, cmd: string) {
    cred = fixupCredentials(config, cred);
    return doRun(config, cred, cmd);
}

async function doRun(config: types.Config, cred: Credential, cmd: string) {
    const bx = `WSK_CONFIG_FILE=${wskProps(cred)} BLUEMIX_HOME=${cred.home} bx ${cmd}`;
    config.logger.debug(`exec ${bx}`);
    try {
        return await exec(bx);
    } catch (e) {
        if (await doLogin(config, cred))
            return doRun(config, cred, cmd); //  tokens have been refreshed. Retry command.
        else {
            throw e; // something else happened.
        }
    }
}

// Login to Bluemix
export const login = async (config: types.Config, cred: Credential) => {
    cred = fixupCredentials(config, cred);
    try {
        try {
            await doRun(config, cred, 'target');
        } catch (e) {
            await doLogin(config, cred);
        }
        return true;
    } catch (e) {
        return false;
    }
};

// Login to Bluemix. @return true if tokens have been refreshed.
async function doLogin(config: types.Config, cred: Credential) {
    try {
        const target = `WSK_CONFIG_FILE=${wskProps(cred)} BLUEMIX_HOME=${cred.home} bx target`;
        config.logger.debug(`exec ${target}`);
        await exec(target);
        return false;
    } catch (e) {
        await refreshTokens(config, cred);
        return true;
    }
}

async function refreshTokens(config: types.Config, cred: Credential) {
    config.startProgress('login to Bluemix');
    const space = cred.space ? `-s ${cred.space}` : '';
    const bx = `WSK_CONFIG_FILE=${wskProps(cred)} BLUEMIX_HOME=${cred.home} bx login -a ${cred.endpoint} --apikey ${cred.apikey} -o ${cred.org} ${space}`;
    try {
        await exec(bx);
    } catch (e) {
        if (space && e.stdout && e.stdout.includes(`Space '${cred.space}' was not found.`)) {
            // space does not exist and requested => create.
            const newspace = `WSK_CONFIG_FILE=${wskProps(cred)} BLUEMIX_HOME=${cred.home} bx account space-create ${cred.space}`;
            await exec(newspace);
        } else {
            config.logger.error(e);
            throw e;
        }
    } finally {
        config.terminateProgress();
    }
    return true;
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
        config.fatal('cannot login to Bluemix: missing apikey');
    }
    cred.org = cred.org || process.env.BLUEMIX_ORG;
    if (!cred.org) {
        config.fatal('cannot login to Bluemix: missing org');
    }
    if (!cred.space && !cred.home) {
        config.fatal('cannot login to Bluemix: missing either space or home');
    }
    if (!cred.home) {
        cred.home = path.join(config.cache, '.bluemix', cred.endpoint, cred.org, cred.space);
    }
    return cred;
}

export async function ensureSpaceExists(config: types.Config, cred: Credential) {
    config.startProgress(`checking ${cred.space} space exists`);
    cred = fixupCredentials(config, cred);

    await doRun(config, cred, `account space-create ${cred.space}`); // fast when already exists
    await doRun(config, cred, `target -s ${cred.space}`);

    await installWskPlugin(config, cred);
    await refreshWskProps(config, cred, 5); // refresh .wskprops
    config.terminateProgress();
}

async function refreshWskProps(config: types.Config, cred: Credential, retries: number) {
    if (retries <= 0)
        config.fatal('unable to obtain wsk authentication key. try again later.');
    const io = await doRun(config, cred, 'wsk property get');
    if (io.stderr) {
        await delay(1000);
        await refreshWskProps(config, cred, retries - 1);
    }
}

// Get Wsk AUTH and APIGW_ACCESS_TOKEN for given credential. If cred space does not exist, create it.
export async function getWskPropsForSpace(config: types.Config, cred: Credential) {
    config.startProgress('retrieving wsk authentication');
    await ensureSpaceExists(config, cred);
    config.terminateProgress();
    return parser.read(wskProps(cred));
}

// async function readiedBackend(config: types.Config, wskpropsFile: string) {
//     const wskprops = propertiesParser.createEditor(wskpropsFile);

//     if (wskprops.get('APIHOST').endsWith('.bluemix.net')) {
//         const cred: bx.Credential = { org: wskprops.get('BLUEMIX_ORG'), space: wskprops.get('BLUEMIX_SPACE') };
//         bx.fixupCredentials(config, cred);
//         await bx.ensureSpaceExists(config, cred);

//         // Patch APIGW_ACCESS_TOKEN
//         const bxwskprops = propertiesParser.read(`${cred.home}/.wskprops`);
//         if (wskprops.get('APIGW_ACCESS_TOKEN') !== bxwskprops.APIGW_ACCESS_TOKEN) {
//             wskprops.set('APIGW_ACCESS_TOKEN', bxwskprops.APIGW_ACCESS_TOKEN);
//             wskprops.save();
//         }
//     }
// }
