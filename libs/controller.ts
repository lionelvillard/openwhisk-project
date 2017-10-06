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

// OpenWhisk REST API implementation backed by local resources.
import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as path from 'path';
import * as types from './types';
import * as utils from './utils';
import * as names from './names';
import * as inits from './init';
import * as https from 'https';
import * as fs from 'fs-extra';
import * as getPort from 'get-port';
import { exec } from 'child-process-promise';
import * as rp from 'request-promise';
import * as net from 'net';

const resourceDoesNotExist = 'The requested resource does not exist.';
const projectDoesNotExist = 'The requested project does not exist.';
const containerFailed = 'Container failed to start. Is the Docker daemon up and running?';

const app: express.Express = express();

let config: types.Config;

type IProject = string;

// Managed project configuration
const projects: { [root: string]: any } = {};

let defaultProject: string;

interface IContainer {
    id: string;
    endpoint: string;
    project: IProject;
    debugPort: number;
}

enum ClientState { IDLE };
interface IClient {
    socket: net.Socket;
    state: ClientState;
}

// inactive container pool, indexed by action name
let pool: { [index: string]: IContainer } = {};

// active containers, 
let active: { [index: string]: IContainer } = {};

// socket for attach/detach events
let server;

// connected clients
let clients: { [port: number]: IClient } = {};

export async function init(cfg: types.Config) {
    try {
        await inits.init(cfg);
        config = cfg;

        if (cfg.cache) {
            const projectPath = path.join(cfg.cache, 'build', 'project.json');
            if (fs.pathExistsSync(projectPath)) {

                projects[cfg.cache] = fs.readJsonSync(projectPath);
                defaultProject = cfg.cache;
            }
        }
    } catch (e) {
        console.log(e)
    }
}

export function start(port: number) {
    const sslOptions = {
        key: fs.readFileSync(path.join(__dirname, '..', '..', 'resources', 'key.pem')),
        cert: fs.readFileSync(path.join(__dirname, '..', '..', 'resources', 'cert.pem')),
        passphrase: 'aaaa'
    };
    https.createServer(sslOptions, app).listen(port);
    config.logger.info(`local controller listening port ${port}`);

    server = net.createServer(c => {
        config.logger.info(`client connected port ${c.localPort}`);

        clients[c.localPort] = {
            socket: c,
            state: ClientState.IDLE
        };

        c.on('end', () => {
            config.logger.info(`client disconnect port ${c.localPort}`);
            delete clients[c.localPort];
        });
    });

    server.on('error', err => {
        throw err;
    });

    server.listen(port + 1);
    config.logger.info(`local controller socket listening port ${port + 1}`);
}

export async function stop() {
    const ids = [...Object.keys(active), ...Object.keys(pool).map(name => pool[name].id)];
    active = {};
    pool = {};

    if (ids.length > 0) {
        try {
            const cmd = `docker stop ${ids.join(' ')}`;
            return exec(cmd);
        } catch (e) {
        }
    }

    if (server) {
        server.close();
        server = null;
    }
}

// --- app config

app.use(bodyParser.json());

// --- routes


// action get
app.get('/api/v1/namespaces/:namespace/actions/:packageName?/:actionName', async (req, res, next) => {
    try {
        const project = await getProject(req);
        if (!project)
            return terminate(res, error(404, projectDoesNotExist));

        const { namespace, packageName, actionName } = req.params;
        const action = utils.getAction(project, packageName, actionName);
        if (!action)
            return terminate(res, error(404, resourceDoesNotExist));

        const annotations = utils.getKeyValues(action.annotations);
        const parameters = utils.getKeyValues(action.inputs);
        const limits = action.limits;
        const publish = action.publish ? 'true' : 'false';

        res.type('json');
        res.send({
            namespace: `/${namespace}${packageName ? '/' : ''}${packageName}`,
            name: actionName,
            exec: {
                kind: action.kind,
                code: 'todo'
            },
            annotations,
            parameters,
            limits,
            publish
        });
    } catch (e) {
        next(e);
    }
});

// action invoke
app.post('/api/v1/namespaces/:namespace/actions/:packageName?/:actionName', async (req, res, next) => {
    try {
        const project = await getProject(req);
        if (!project)
            return terminate(res, error(404, projectDoesNotExist));

        const { namespace, packageName, actionName } = req.params;
        const activationId = '<id>';
        const debugport = req.query.debugport === 'false' ? false : req.query.debugport;

        if (req.query.blocking === 'true') {
            const result = await invoke(project, activationId, packageName, actionName, req.body, debugport);

            if (result.error) {
                return terminate(res, error);
            }

            res.status(200).type('json').send(result);
        } else {
            invoke(project, activationId, packageName, actionName, req.body, debugport);
            res.status(200).type('json').send({ activationId });
        }
    } catch (e) {
        next(e);
    }
});

app.all('*', (req, res) => {
    return terminate(res, error(404, resourceDoesNotExist));
})

// --- utils

async function invoke(project, activationId, packageName, actionName, params, debugport) {
    const action = utils.getAction(project, packageName, actionName);
    if (!action)
        return error(404, resourceDoesNotExist);

    if (action.hasOwnProperty('sequence')) {
        let data = { ...action.inputs, ...params };

        for (const qname of action.sequence) {
            const { namespace, pkg, name } = names.parseQName(qname);
            const result = await invoke(project, activationId, pkg, name, data, debugport);
            data = result.response.result;
            debugport = false;
        }
        return data;
    } else {
        const code = (await fs.readFile(action.location)).toString();

        const container = await getContainer(project, action, debugport);
        if (!container)
            return error(500, containerFailed);

        const uri = container.endpoint;

        const init = await rp({
            method: 'POST',
            uri: `${uri}/init`,
            json: true,
            body: {
                value: {
                    main: 'main',
                    code,
                    sourceURL: path.basename(action.location)
                }
            }
        });

        const result = await rp.post({
            uri: `${uri}/run`,
            json: true,
            body: {
                value: params
            }
        });

        // Put container in pool
        pool[action._qname] = container;
        delete active[container.id];

        return {
            activationId,
            response: {
                result,
                status: 'success',
                success: true
            }
        };
    }
}

function error(statusCode, message) {
    return { error: message, code: statusCode };
}

function terminate(res, msg) {
    res.status(msg.code).type('json').send(msg);
}

async function getContainer(project, action, requestedDebugPort) {
    try {
        let container: IContainer;

        // // pooled?
        // container = pool[action._qname];
        // if (container) {
        //     config.logger.info(`reusing pooled container ${container.id} bound to ${container.endpoint}`);

        //     delete pool[action._qname];
        // }

        if (!container) {
            const port = await getPort();
            const debugPort = await (requestedDebugPort ? getPort({ port: requestedDebugPort }) : getPort());

            const cmd = `docker run -d -p ${port}:8080 -p ${debugPort}:5858 wskp/nodejs6action node --inspect=5858 app.js`;

            config.logger.info(`starting container: ${cmd}`);
            const output = await exec(cmd);
            const endpoint = `http://localhost:${port}`;
            container = { project, id: output.stdout.trim(), endpoint, debugPort };

            // Wait for app to come up.
            // TODO: timeout
            let code;
            while (code !== 404) {
                try {
                    await rp(endpoint);
                } catch (e) {
                    code = e.statusCode;
                }
            }
        }
        active[container.id] = container;

        config.logger.info('container ready');

        for (const clientid in clients) {
            clients[clientid].socket.write(`{"name":"attach", "actionName": "${action._qname}", "debugPort": ${container.debugPort}}\n`);
        }
        await wait(1000);

        return container;
    } catch (e) {
        config.logger.error(e);
        return null;
    }
}

async function getProject(req) {
    const encodedRoot = req.headers.authorization;
    if (encodedRoot && encodedRoot.startsWith('Basic ')) {
        const root = Buffer.from(encodedRoot.substr(6), 'base64').toString().substr(1);
        if (projects[root]) {
            return projects[root];
        }
        return await loadProject(root);
    }
    return projects[defaultProject];
}

async function loadProject(root) {
    const projectPath = path.join(root, '.openwhisk', 'build', 'project.json');
    if (await fs.pathExists(projectPath)) {
        projects[root] = await fs.readJson(projectPath);
        return projects[root];
    }
    return null;
}

function wait(time) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), time);
    })
}