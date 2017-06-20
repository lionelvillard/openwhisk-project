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

const deepDiff = require('deep-diff')

const fail = (t, actual, expected) => {
    return t.deepEqual(expected, actual)
}

const diffModulo = (t, actual, expected) => {
    const diff = deepDiff.diff(expected, actual)
    if (diff) {
        for (const edit of diff) {

            // not a value change: fail
            if (edit.kind !== 'E')
                return fail(t, actual, expected)

            if (!edit.path)
                return fail(t, actual, expected)

            const l = edit.path[edit.path.length - 1]
            const l1 = edit.path[edit.path.length - 2]

            if (!(l === 'path' && l1 === 'trigger')) // ignore trigger/path
              if (l !== 'version' && l !== 'namespace' && l !== 'location' && l !== 'authKey')
                return fail(t, actual, expected)

        }


    }
    t.pass()
}

const deleteCode = json => {
    switch (typeof json) {
        case 'object':
            delete json.code
            for (const key in json) {
                deleteCode(json[key])
            }
            break
        case 'array':
            for (const i in json) {
                deleteCode(json[i])
            }
            break
        default:
    }
}


exports.deepEqualModulo = diffModulo
exports.deleteCode = deleteCode