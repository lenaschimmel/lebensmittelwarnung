set -e
docker build . -t warn
docker run -d -v "$(pwd)"/innertmp:/usr/src/app/tmp --name warn warn
docker logs -f --tail 0 warn
