set -e
docker build . -t warn
run -v "$(pwd)"/innertmp:/usr/src/app/tmp warn