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

const fakeow = {
    actions: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    feeds: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    namepaces: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    packages: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    rules: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    routes: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    triggers: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    }
}

module.exports = fakeow