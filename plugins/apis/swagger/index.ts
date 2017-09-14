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
import * as wskd from 'openwhisk-deploy';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as yaml from 'yamljs';

// --- Plugin export

export function apiContributor(config, deployment, apiname: string, api: wskd.types.Api) {
    const file = path.resolve(config.basePath, api.swagger);
    const parts = path.parse(file);
    if (parts.ext !== '.json' && parts.ext !== '.yml' && parts.ext != '.yaml') {
        throw `Unrecognized swagger file extension: ${parts.ext}`;
    }
    const content = fs.readFileSync(file).toString();
    let swagger = (parts.ext === '.json') ? JSON.parse(content) : yaml.parse(content);

    return [cleanup({
        kind: "api",
        name: apiname,
        body: {
            basePath: swagger.basePath,
            paths: getPaths(swagger.paths)
        }
    })];
}

function getPaths(paths) {
    const wpaths = {};
    for (const path in paths) {
        wpaths[path] = getPath(paths[path]);
    }
    return wpaths;
}

function getPath(path) {
    const woperations = {};
    for (const operation in path) {
        woperations[operation] = getOperation(path[operation]);
    }
    return woperations;
}

function getOperation(operation) {
    return operation['x-openwhisk-action'];
}

function cleanup(obj) {
    Object.keys(obj).forEach(key => {
        if (obj[key] === undefined)
            delete obj[key];
    });
    return obj;
}
