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
const test = require('ava')
const deployer = require('../../deployer')
const util = require('util')
const diff = require('../helpers/diff')

require('../helpers/setup')(test)

const gold1 = {
    "packages": [
        {
            "qname": "docker",
            "deployResult": {
                "name": "docker",
                "binding": {},
                "publish": false,
                "annotations": [],
                "version": "0.0.0",
                "parameters": [],
                "namespace": "_"
            }
        }],
    "actions": [
        {
            "qname": "docker/docker-skeleton",
            "location": "",
            "kind": "image",
            "params": [],
            "deployResult": {
                "name": "docker-skeleton",
                "publish": false,
                "annotations": [
                    { "key": "exec", "value": "blackbox" }
                ],
                "version": "0.0.0",
                "exec": {
                    "kind": "blackbox",
                    "image": "openwhisk/dockerskeleton",
                    "binary": false
                },
                "parameters": [],
                "limits": { "timeout": 60000, "memory": 256, "logs": 10 },
                "namespace": "_/docker"
            }
        }]
}


test('Deploy skeleton docker image', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/actions/fixtures/docker',
        cache: t.context.tmpdir,
        location: 'skeleton.yaml',
        force: true
    })

    //console.log(JSON.stringify(result))
    diff.deepEqualModulo(t, result, gold1)
})
