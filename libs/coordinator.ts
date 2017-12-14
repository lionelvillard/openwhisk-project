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
export const rejectedTasks = new Array<Task<any>>();

// Register new task
export function task<T>(executor: Executor<T>, tags: string[] = []): Task<T> {
    return ptask(() => new Promise(executor), tags);
}

// Register new task
export function ptask<T>(delayedPromise: () => Promise<T>, tags: string[] = []): Task<T> {
    if (accept(tags)) {
        const tsk = new Task(delayedPromise());
        tasks.add(tsk);
        return tsk;
    }
    return null;
}

// Wait for the fullfilment (or rejection) of all currently running tasks.
export async function waitForAllTasks(): Promise<void> {
    await Promise.all(tasks.values());
}

/* A task. Basically a promise exposing the resolved/rejected value */
export class Task<T> {

    /* Resolved value */
    public resolved: T;

    /* Rejected reason */
    public reason: T;

    /* Pending fulfillment awaiters */
    private awaiters = [];

    /* Pending rejection awaiters */
    private rejectionAwaiters = [];

    /* Task status: 0=pending, 1=resolved, 2=rejected */
    private status: number;

    constructor(
        /* Promise */
        public promise: Promise<T>,
    ) {
        this.status = 0;
        promise
            .then(v => { this.status = 1; tasks.delete(this); this.resolved = v; this.notify(); })
            .catch(e => { this.status = 2; tasks.delete(this); this.reason = e; rejectedTasks.push(this); this.notify(); });
    }

    public then(onfulfilled?: (T) => any, onrejected?: (any) => any) {
        this.notifyFulfilled(onfulfilled);
        if (onrejected)
            this.notifyRejected(onrejected);
        return this;
    }

    public catch(onrejected: (any) => any) {
        this.notifyRejected(onrejected);
        return this;
    }

    private notifyFulfilled(onfulfilled) {
        switch (this.status) {
            case 0:
                this.awaiters.push(onfulfilled);
                break;
            case 1:
                onfulfilled(this.resolved);
                break;
        }
    }

    private notifyRejected(onrejected) {
        switch (this.status) {
            case 0:
                this.rejectionAwaiters.push(onrejected);
                break;
            case 2:
                onrejected(this.reason);
                break;
        }
    }

    private notify() {
        if (this.status === 1) {
            while (this.awaiters.length > 0) {
                this.notifyFulfilled(this.awaiters.shift());
            }
            this.rejectionAwaiters = null;
        } else if (this.status === 2) {
            while (this.rejectionAwaiters.length > 0) {
                this.notifyRejected(this.rejectionAwaiters.shift());
            }
            this.awaiters = null;
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
