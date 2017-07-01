#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

export BX_SPACE_CI=openwhisk-deploy-ci`uuidgen`

bx iam space-create ${BX_SPACE_CI}

echo Wait 10 seconds
sleep 10 # to make sure the OW keys gets initialized

(cd ${DIR}/../libs/builder && npm test)
(cd ${DIR}/../libs/deployer && npm test)
(cd ${DIR}/../libs/deployer/plugins/actions/combinator && npm test)

bx iam space-delete ${BX_SPACE_CI} -f