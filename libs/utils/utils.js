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
const request = require('request-promise');

exports.haveRepo = haveRepo;
exports.fetchContent = fetchContent;
exports.assignManifest = assignManifest;


// Check manifest is present, otherwise fetch it.
function assignManifest(args) {
    if (args.hasOwnProperty('manifest')) {
        return Promise.resolve(args);
    }

    // No manifest: need a repo.
    if (!haveRepo(args))
        return Promise.reject(`Missing repository properties ('owner', 'repo', and 'sha')`);

    return fetchContent(args, 'manifest.yaml')
        .then(manifest => {
            args.manifest = manifest;
            return args;
        });
}

// Fetch file content in GitHubRepository
function fetchContent(args, location) {
    if (!haveRepo(args))
        return Promise.reject(`Missing repository properties ('owner', 'repo', and 'sha') needed to get ${location}`);

    return request({
        uri: `https://raw.githubusercontent.com/${args.owner}/${args.repo}/${args.sha}/${location}`
    }).then(result => {
        console.log(`fetched ${location}`);
        return result;
    });
}

//
function haveRepo(args) {
    return args.hasOwnProperty('assets') && args.assets.hasOwnProperty('conf') &&
        args.assets.conf.hasOwnProperty('owner') && args.assets.conf.hasOwnProperty('repo') &&
        args.assets.conf.hasOwnProperty('sha');
}