import json
from pathlib import Path

# Read both JSONs
graph = json.loads(Path('graphify-out/graph.json').read_text(encoding='utf-8'))
docs = json.loads(Path('graphify-out/.graphify_semantic_docs.json').read_text(encoding='utf-8'))

print(f'Before: {len(graph["nodes"])} nodes, {len(graph["links"])} links')

# Merge nodes (NetworkX format)
seen_ids = {n['id'] for n in graph['nodes']}
added = 0
for node in docs['nodes']:
    if node['id'] not in seen_ids:
        # Add community_name if missing
        node['community_name'] = node.get('source_file', 'doc').split('.')[0]
        graph['nodes'].append(node)
        added += 1

# Convert edges to links (NetworkX format: source, target, key, relation, confidence)
for edge in docs['edges']:
    link = {
        'source': edge['source'],
        'target': edge['target'],
        'key': f"{edge['source']}_{edge['target']}_{edge['relation']}",
        'relation': edge['relation'],
        'confidence': edge.get('confidence', 0.90)
    }
    graph['links'].append(link)

Path('graphify-out/graph.json').write_text(json.dumps(graph, indent=2, ensure_ascii=False), encoding='utf-8')
print(f'After: {len(graph["nodes"])} nodes, {len(graph["links"])} links (+{added} nodes, {len(docs["edges"])} links)')
