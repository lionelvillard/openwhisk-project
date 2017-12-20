/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE2.0
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
import { IConfig } from './types';
import { delay } from './utils';
import * as parser from 'properties-parser';
import { readJson } from 'fs-extra';
import { decode } from 'jsonwebtoken';

// @return true if Bluemix is installed
export const isBluemixCapable = async () => {
    if (process.env.BLUEMIX_API_KEY) {
        try {
            await exec('bx');
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
};

export type Credential = ICredential;
export interface ICredential {
    endpoint?: string;
    apikey?: string;
    org?: string;
    space?: string;
    home?: string; // automatically computed.
}

const wskProps = (cred: Credential) => `${cred.home}/.wskprops`;

// Run bluemix command. Retries once if not logged in.
export async function run(config: IConfig, cred: ICredential, cmd: string) {
    cred = fixupCredentials(config, cred);
    return doRun(config, cred, cmd);
}

async function doRun(config: IConfig, cred: Credential, cmd: string, retry = true) {
    const bx = `BLUEMIX_HOME=${cred.home} bx ${cmd}`;
    config.logger.debug(`exec ${bx}`);
    try {
        await loginIfExpired(config, cred);
        return await exec(bx);
    } catch (e) {
        if (retry) {
            await doLogin(config, cred);
            return doRun(config, cred, cmd, false);
        }
        throw e; // something else happened.
    }
}

async function loginIfExpired(config: IConfig, cred: Credential) {
    // TODO: caching.
    const bxcfg = await loadBluemixConfigJSON(config, cred);
    if (!bxcfg || !bxcfg.IAMToken || expired(bxcfg.IAMToken)) {
        await doLogin(config, cred);
    }
}

function expired(token: string) {
    const decoded = decode(token.substr(7), { complete: true });
    return ((Date.now() / 1000) - 300) >= decoded.payload.exp; // give 5mn to run the command.
}

// Login to Bluemix.
async function doLogin(config: IConfig, cred: Credential) {
    // TODO: concurrency
    config.startProgress('login to Bluemix');

    const space = cred.space ? `-s ${cred.space}` : '';
    const bx = `BLUEMIX_HOME=${cred.home} bx login -a ${cred.endpoint} --apikey ${cred.apikey} -o ${cred.org} ${space}`;
    config.logger.debug(`exec ${bx}`);
    try {
        await exec(bx);
    } finally {
        config.terminateProgress();
    }
}
//
export function fixupCredentials(config: IConfig, cred: ICredential) {
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

    if (!cred.home) {
        cred.home = path.join(config.cache, '.bluemix', cred.endpoint, cred.org);
        if (cred.space)
            cred.home = path.join(cred.home, cred.space);
    }
    return cred;
}

async function ensureSpaceExists(config: IConfig, cred: ICredential) {
    if (!cred.space)
        config.fatal('missing bluemix space');
    try {
        config.startProgress(`checking ${cred.space} space exists`);

        const orgcred = fixupCredentials(config, { endpoint: cred.endpoint, apikey: cred.apikey, org: cred.org });
        await doRun(config, orgcred, `account space-create ${cred.space}`); // fast when already exists
        await doRun(config, cred, `target -s ${cred.space}`);
    } finally {
        config.terminateProgress();
    }
}

// Convert env name to valid namespace
function escapeNamespace(str: string) {
    // The first character must be an alphanumeric character, or an underscore.
    // The subsequent characters can be alphanumeric, spaces, or any of the following: _, @, ., -
    return str.replace(/[+]/g, '-');
}

// Force delete the given space
export async function deleteSpace(config: IConfig, cred: Credential, space: string) {
    try {
        await run(config, cred, `account space-delete ${space} -f`);
    } catch (e) {
        config.logger.info(`failed to delete space ${space}: ${e.stdout}`);
    }
}

// Force delete the given cf service
export async function deleteService(config: IConfig, cred: Credential, service: string) {
    try {
        await run(config, cred, `service delete ${service} -f`);
    } catch (e) {
        config.logger.info(`failed to delete service ${service}: ${e.stdout}`);
    }
}

// Load bluemix config file for given credentials
async function loadBluemixConfigJSON(config: IConfig, cred: ICredential) {
    if (!cred.home)
        return null;
    let configFile = path.join(cred.home, '.bluemix', 'config.json');
    if (! await fs.pathExists(configFile)) {
        return null;
    }
    return fs.readJson(configFile);
}

// Load cf config file for given credentials
async function loadCFConfigJSON(config: IConfig, cred: ICredential) {
    if (!cred.home)
        return null;
    let configFile = path.join(cred.home, '.bluemix', '.cf', 'config.json');
    if (! await fs.pathExists(configFile)) {
        return null;
    }
    return fs.readJson(configFile);
}

// --- wsk related functions

// Populate props with Bluemix specific authentication
export async function resolveAuth(config: IConfig, props, env: string, version: string) {
    if (!isBluemixCapable())
        config.fatal('bx is not installed');

    let bxorg = process.env.BLUEMIX_ORG || props.get('BLUEMIX_ORG');
    if (!bxorg)
        config.fatal('cannot resolve AUTH and APIGW_ACCESS_TOKEN from Bluemix credential: missing BLUEMIX_ORG');

    let bxspace = props.get('BLUEMIX_SPACE');
    bxspace = bxspace ? bxspace.trim() : null;
    if (!bxspace) {
        if (!config.projectname)
            config.fatal(`cannot resolve AUTH: missing project name.`);

        if (version)
            bxspace = `${config.projectname}-${env}@${version}`;
        else
            bxspace = `${config.projectname}-${env}`;

        bxspace = escapeNamespace(bxspace);
        config.logger.info(`targeting ${bxspace} space`);
    }

    const cred: Credential = { org: bxorg, space: bxspace };
    const wskprops = await initWsk(config, cred);

    if (!wskprops.AUTH)
        config.fatal('missing AUTH in .wskprops');
    if (!wskprops.APIGW_ACCESS_TOKEN)
        config.fatal('missing APIGW_ACCESS_TOKEN in .wskprops');

    props.set('PROJECTNAME', config.projectname);
    props.set('ENVNAME', env);
    if (version)
        props.set('ENVVERSION', version);
    props.set('BLUEMIX_ORG', bxorg);
    props.set('BLUEMIX_SPACE', bxspace);
    props.set('AUTH', wskprops.AUTH);
    props.set('APIGW_ACCESS_TOKEN', wskprops.APIGW_ACCESS_TOKEN);
}

/*
  Prepare backend so that the OpenWhisk client works.
  @return .wskprop content or null
*/
export async function initWsk(config: IConfig, cred: Credential) {
    cred = fixupCredentials(config, cred);
    config.startProgress('retrieving wsk authentication');
    try {
        await ensureSpaceExists(config, cred);
        await refreshWskProps(config, cred);
        return parser.read(wskProps(cred));
    } finally {
        config.terminateProgress();
    }
}

// Send request to get all OpenWhisk keys for the given Bluemix authentication
async function getAuthKeys(accessToken, refreshToken) {
    return request({
        method: 'POST',
        uri: 'https://openwhisk.ng.bluemix.net/bluemix/v2/authenticate',
        body: {
            accessToken: accessToken.substr(7),
            refreshToken
        },
        json: true
    });
}

/*
 * Wait for the given org_spaces to be available in OpenWhisk
 * @return {Object[]} the list of keys for the given spaces
 */
async function waitForAuthKeys(config: IConfig, accessToken: string, refreshToken: string, names: string[], retry = 60) {
    if (names.length === 0)
        return [];

    if (retry <= 0)
        config.fatal('unable to obtain wsk authentication key (timeout). try again later.');
    config.logger.debug(`get wsk auth keys (retries: ${retry})`);
    const keys = await getAuthKeys(accessToken, refreshToken);
    const namespaces = keys.namespaces;
    const spacekeys = namespaces.filter(ns => names.includes(ns.name));

    if (spacekeys.length === names.length) {
        return spacekeys;
    }
    await delay(1000);
    return waitForAuthKeys(config, accessToken, refreshToken, names, retry - 1);
}

async function refreshWskProps(config: IConfig, cred: Credential) {
    try {
        config.startProgress('refreshing wsk properties');

        const cfcfg = await loadCFConfigJSON(config, cred);
        if (!cfcfg || !cfcfg.AccessToken || !cfcfg.RefreshToken)
            config.fatal('missing access token in %s', cred.home);

        const keys = await waitForAuthKeys(config, cfcfg.AccessToken, cfcfg.RefreshToken, [`${cred.org}_${cred.space}`]);
        const props = parser.createEditor();
        props.set('APIVERSION', 'v1');
        props.set('APIHOST', 'openwhisk.ng.bluemix.net');
        props.set('AUTH', `${keys[0].uuid}:${keys[0].key}`);
        props.set('NAMESPACE', '_');
        props.set('APIGW_ACCESS_TOKEN', cfcfg.AccessToken.substr(7));
        props.save(wskProps(cred));
        return props;
    } finally {
        config.terminateProgress();
    }
}
