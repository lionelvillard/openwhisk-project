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

// Convenient promise executor type
export type Executor<T> = (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void;

const filteringTags = [];

// Tells which tasks should not run.
export function filterTasks(tags: string[]) {
    filteringTags.push(tags);
}

// All tasks currently running
const tasks = new Set<Task<any>>();

// Errored tasks
export const errored = new Array<Task<any>>();

// Register new task
export function task<T>(executor: Executor<T>, tags: string[] = []): Task<T> {
    return ptask(() => new Promise(executor), tags);
}

// Register new task
export function ptask<T>(delayedPromise: () => Promise<T>, tags: string[] = []): Task<T> {
    if (accept(tags)) {
        const tsk = new Task(delayedPromise());
        tasks.add(tsk);
        tsk.then(() => tasks.delete(tsk));
        return tsk;
    }
    return null;
}

// Wait for the fullfilment of all currently running tasks.
export async function allTasks(): Promise<void> {
    await Promise.all(tasks.values());
}

/* A task. Basically a promise exposing the resolved/rejected value */
export class Task<T> {

    /* Resolved value */
    public resolved: T;

    /* Pending awaiters */
    private awaiters = [];

    constructor(
        /* Promise */
        public promise: Promise<T>,
    ) {
        promise
            .then(v => { this.resolved = v; this.notify(); })
            .catch(e => { errored.push(this); });
    }

    public then(onfulfilled?: (T) => any, onrejected?: (any) => any) {
        this.notifyAwaiter({ onfulfilled, onrejected });
    }

    private notifyAwaiter(awaiter) {
        if (this.resolved)
            awaiter.onfulfilled(this.resolved);
       // else if (this.reason)
         //   awaiter.onrejected(this.reason);
        else
            this.awaiters.push(awaiter);

    }

    private notify() {
        while (this.awaiters.length > 0) {
            this.notifyAwaiter(this.awaiters.shift());
        }
    }

}

// -- helpers

function accept(tags: string[]) {
    if (!tags)
        return true;

    for (const tag of tags) {
        if (filteringTags.includes(tag))
            return false;
    }
    return true;
}
