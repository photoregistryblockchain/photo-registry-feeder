# Photo Registry Feeder

Node.js process that reads notifications from an Amazon queue where new media is pushed as it becomes available by an integrated system.

Once a new queue notification arrives:

1. Retrieves the enriched metadata from the content

2. Packs the metadata in a standard JSON format

3. Calculates a perceptive hash (p-hash) over the content

4. Registers the published images to the Orbs smart contract on the registry virtual chain
