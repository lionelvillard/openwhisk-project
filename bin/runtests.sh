#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

export BX_SPACE_CI=openwhisk-deploy-ci`uuidgen`

bx iam space-create ${BX_SPACE_CI}

echo Wait for key to sync
sleep 10

(cd ${DIR}/.. && npm test)
code=$?

(cd ${DIR}/../plugins/actions/combinator && npm test)
(( code = code || $? ))

bx iam space-delete ${BX_SPACE_CI} -f

exit $code