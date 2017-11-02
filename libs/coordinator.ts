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

// Convenient promisee executor type
type Executor<T> = (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void;

// enum TaskStatus { RUNNING, COMPLETED, FAILED }

export function task<T>(executor: Executor<T>, tags: string[] = []): Task<T> {
    const tsk = new Task(executor, tags);
    tsk.then(() => tsk.completed());
    return tsk;
}

/* A task is a Promise with additional properties */
export class Task<T> extends Promise<T> {

    // Pending tasks
    static pendingTasks = new Set<Task<any>>();

    //  public status: TaskStatus = TaskStatus.RUNNING;

    /* Whether the patcher function has been set */
    public patcher;

    constructor(
        /* Promise executor */
        public executor: Executor<T>,

        /* General purpose tags. Can be used for filtering and task ordering */
        public tags: string[]
    ) {
        super(executor);

        Task.pendingTasks.add(this);
    }

    public completed() {
        Task.pendingTasks.delete(this);
    }

}

// /* Task composition */
// export class CompoundTask<T> extends Task<T> {

//     constructor(
//         public dependsOn: Task<any>[],
//         public tags: string[]
//     ) {
//         super();
//     }

// }
