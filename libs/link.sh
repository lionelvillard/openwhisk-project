#!/usr/bin/env bash

(cd utils && npm link)
(cd builder && npm link)

(cd builder && npm link @openwhisk-deploy/utils)

(cd deployer && npm link @openwhisk-deploy/utils)
(cd deployer && npm link @openwhisk-deploy/builder)