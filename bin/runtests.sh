#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# SPACE=${BX_SPACE:-openwhisk-deploy-ci`uuidgen`}

# bx iam space-create ${SPACE}

# echo Wait 20s for key to sync
# sleep 20

(cd ${DIR}/.. && npm test)
code=$?

#(cd ${DIR}/../plugins/actions/combinator && npm test)
#(( code = code || $? ))

# bx iam space-delete ${SPACE} -f

exit $code