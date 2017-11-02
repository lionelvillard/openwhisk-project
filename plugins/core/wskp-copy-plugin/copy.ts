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
import * as dcopy from 'deep-copy';

// --- Plugin export

export async function actionContributor(config: wskd.IConfig, project: wskd.IProject, pkgName: string, actionName: string, action: wskd.IAction) {
    const copiedActionName = wskd.names.resolveQName(action.copy, project.namespace, pkgName);

    const copiedAction = findAction(project, copiedActionName);
    let newAction;
    if (copiedAction) {
        // Local action: just copy all properties.

        newAction = dcopy(copiedAction);
    } else {
        try {
            const remoteAction = await config.ow.actions.get(copiedActionName);

            newAction = {
                kind: remoteAction.exec.kind,
                inputs: indexKeyValues(remoteAction.parameters),
                annotations: indexKeyValues(remoteAction.annotations),
                limits: remoteAction.limits
            }
            switch (remoteAction.exec.kind) {
                case 'sequence':
                    newAction.sequence = remoteAction.exec.components;
                    break;
                case 'blackbox':
                    newAction.docker = remoteAction.exec.image;
                    break;
                default:
                    newAction.code = remoteAction.exec.code;
            }
        } catch (e) {
            config.fatal('Action %s does not exist', copiedActionName);
        }
    }

    // Overrides base action properties
    newAction.inputs = { ...newAction.inputs, ...action.inputs };
    newAction.annotations = { ...newAction.annotations, ...action.annotations };
    newAction.limits = { ...newAction.limits, ...action.limits };
    newAction.builder = { ...newAction.builder, ...action.builder };

    return [{
        kind: "action",
        pkgName,
        name: actionName,
        body: newAction
    }];
}

// Look for the action of the given full-qualified name in the manifest.
function findAction(project, actionName) {
    const parts = wskd.names.parseQName(actionName);
    const packages = project.packages;
    for (const pkgName in packages) {
        if (parts.pkg === pkgName) {
            const pkg = packages[pkgName] || {};
            const actions = pkg.actions || {};
            const action = actions[parts.name];
            if (action) {
                return action;
            }
        }
    }
}

const indexKeyValues = kvs => {
    const index = {};
    if (kvs)
        kvs.forEach(kv => index[kv.key] = kv.value);
    return index;
}