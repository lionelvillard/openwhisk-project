#!/usr/bin/env bash

(cd utils && npm link)
(cd builder && npm link && npm link @openwhisk-deploy/utils)

(cd deployer && npm install)
(cd deployer && npm link @openwhisk-deploy/utils)
(cd deployer && npm link @openwhisk-deploy/builder)

(cd deployer/plugins/actions/combinator && npm install)
