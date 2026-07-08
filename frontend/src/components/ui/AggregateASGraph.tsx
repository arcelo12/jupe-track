import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Network, ZoomIn, ZoomOut, Maximize, X } from 'lucide-react';
import { authFetch } from '@/lib/auth';

interface AggregateASGraphProps {
  paths: string[];
  targetPrefix: string;
}

export function AggregateASGraph({ paths, targetPrefix }: AggregateASGraphProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const [asMappings, setAsMappings] = useState<Record<string, {name: string, type: string}>>({});
  const [ripeNames, setRipeNames] = useState<Record<string, string>>({});

  useEffect(() => {
    authFetch('/api/proxy/as-mapping')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map: Record<string, {name: string, type: string}> = {};
          data.forEach(m => { map[m.asn] = m; });
          setAsMappings(map);
        }
      })
      .catch(err => console.error("Failed to load AS mappings", err));
  }, []);

  const { nodes, edges, layers, width, height } = useMemo(() => {
    if (!paths || paths.length === 0) return { nodes: [], edges: [], layers: [], width: 0, height: 0 };

    const edgeSet = new Set<string>();
    const edgeList: { source: string, target: string }[] = [];
    const uniqueNodes = new Set<string>();

    // Parse all paths
    paths.forEach(pathStr => {
      const parts = pathStr.trim().split(/\s+/).filter(p => !['I', 'E', '?'].includes(p));
      if (parts.length === 0) return;

      const path = parts.map(p => p.replace(/[\[\]\(\)\{\}]/g, ''));
      
      for (let i = 0; i < path.length; i++) {
        uniqueNodes.add(path[i]);
      }

      for (let i = 1; i < path.length; i++) {
        const u = path[i-1];
        const v = path[i];
        if (u === v) continue; // Skip self loops

        const edgeId = `${u}->${v}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edgeList.push({ source: u, target: v });
        }
      }
    });

    const nodesArr = Array.from(uniqueNodes).map(id => ({ id, layer: 0 }));

    // Assign layers by ensuring target layer > source layer (longest path from source)
    for (let i = 0; i < nodesArr.length; i++) {
      let changed = false;
      edgeList.forEach(edge => {
        const sourceNode = nodesArr.find(n => n.id === edge.source)!;
        const targetNode = nodesArr.find(n => n.id === edge.target)!;
        if (targetNode.layer <= sourceNode.layer) {
          targetNode.layer = sourceNode.layer + 1;
          changed = true;
        }
      });
      if (!changed) break; // Optimization: stop if no layers were updated
    }

    // Group by layer
    const maxLayer = Math.max(0, ...nodesArr.map(n => n.layer));
    const layerGroups: string[][] = Array.from({ length: maxLayer + 1 }, () => []);

    nodesArr.forEach(n => {
      layerGroups[n.layer].push(n.id);
    });

    // Layout configuration
    const colWidth = 220;
    const rowHeight = 80;
    const paddingX = 50;
    const paddingY = 50;

    const layoutedNodes: { id: string, x: number, y: number, isOrigin: boolean }[] = [];
    
    let maxNodesInLayer = 0;
    layerGroups.forEach(group => {
      if (group.length > maxNodesInLayer) maxNodesInLayer = group.length;
    });

    const calcHeight = maxNodesInLayer * rowHeight + paddingY * 2;
    const centerY = calcHeight / 2;

    layerGroups.forEach((group, layerIdx) => {
      // Sort nodes inside layer just to have consistent render
      group.sort((a, b) => parseInt(a) - parseInt(b));
      
      const totalInLayer = group.length;
      const startY = centerY - (totalInLayer * rowHeight) / 2 + rowHeight / 2;

      group.forEach((id, nodeIdx) => {
        layoutedNodes.push({
          id,
          x: layerIdx * colWidth + paddingX,
          y: startY + nodeIdx * rowHeight,
          // If it has no outgoing edges, it's an Origin
          isOrigin: !edgeList.some(e => e.source === id)
        });
      });
    });

    return {
      nodes: layoutedNodes,
      edges: edgeList,
      layers: layerGroups.length,
      width: (layerGroups.length - 1) * colWidth + paddingX * 2 + 120, // 120 is approx node width
      height: calcHeight
    };

  }, [paths]);

  // Fetch missing AS names from RIPE Stat
  useEffect(() => {
    if (nodes.length === 0) return;
    
    const missingAsns = nodes.map(n => n.id).filter(id => !asMappings[id] && !ripeNames[id]);
    if (missingAsns.length === 0) return;

    // To prevent spamming the API too heavily at once if there are hundreds, we limit parallel requests.
    // However, usually topologies have < 20 ASNs.
    missingAsns.forEach(asn => {
      // Mark as fetching immediately to prevent duplicate calls
      setRipeNames(prev => ({ ...prev, [asn]: 'Fetching...' }));
      
      fetch(`https://stat.ripe.net/data/as-overview/data.json?resource=${asn}`)
        .then(res => res.json())
        .then(data => {
          if (data?.data?.holder) {
            setRipeNames(prev => ({ ...prev, [asn]: data.data.holder }));
          } else {
            setRipeNames(prev => ({ ...prev, [asn]: 'Unknown' }));
          }
        })
        .catch(() => {
          setRipeNames(prev => ({ ...prev, [asn]: 'Unknown' }));
        });
    });
  }, [nodes, asMappings]);

  if (nodes.length === 0) return null;

  const nodeWidth = 100;
  const nodeHeight = 44;

  const renderGraph = () => (
    <div 
      className="relative w-full h-full min-h-[400px] overflow-auto bg-[#0a0f18] rounded-xl border border-white/5"
      ref={containerRef}
    >
      <div 
        className="absolute transition-transform duration-300 origin-top-left"
        style={{ 
          width: Math.max(width, 800), 
          height: Math.max(height, 400),
          transform: `scale(${zoom})`,
        }}
      >
        <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <polygon points="0 0, 6 3, 0 6" fill="#475569" />
            </marker>
          </defs>
          {edges.map((edge, idx) => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            const targetNode = nodes.find(n => n.id === edge.target);
            if (!sourceNode || !targetNode) return null;

            // Draw cubic bezier curve for smooth bgp.tools like links
            const startX = sourceNode.x + nodeWidth;
            const startY = sourceNode.y + nodeHeight / 2;
            const endX = targetNode.x;
            const endY = targetNode.y + nodeHeight / 2;
            
            const ctrlX1 = startX + (endX - startX) / 2;
            const ctrlY1 = startY;
            const ctrlX2 = startX + (endX - startX) / 2;
            const ctrlY2 = endY;

            return (
              <path
                key={idx}
                d={`M ${startX} ${startY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${endX} ${endY}`}
                fill="none"
                stroke="#334155"
                strokeWidth="1.5"
                markerEnd="url(#arrowhead)"
                className="transition-all duration-300 hover:stroke-emerald-500 hover:stroke-[2.5px] pointer-events-auto cursor-pointer"
              />
            );
          })}
        </svg>

        {nodes.map(node => {
          const mapping = asMappings[node.id];
          const displayType = mapping?.type || (node.isOrigin ? 'Origin' : 'Transit');
          
          return (
            <div
              key={node.id}
              className={`absolute flex flex-col items-center justify-center text-center shadow-lg transition-transform hover:scale-105 cursor-pointer group
                ${node.isOrigin 
                  ? 'bg-emerald-950/80 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                  : 'bg-slate-900 border-slate-700 hover:border-purple-500/50'}
                border rounded-md px-2 py-1.5`}
              style={{
                left: node.x,
                top: node.y,
                width: nodeWidth,
                height: nodeHeight,
              }}
            >
              <span className={`text-xs font-bold font-mono ${node.isOrigin ? 'text-emerald-400' : 'text-slate-200'}`}>
                AS{node.id}
              </span>
              <span className="text-[9px] text-slate-500 uppercase font-semibold">
                {displayType}
              </span>
              
              {/* Hover Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800/95 backdrop-blur-sm text-slate-200 text-xs rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none flex flex-col items-center">
                <div className="font-bold text-emerald-400 text-[13px]">{mapping?.name || ripeNames[node.id] || `AS${node.id}`}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{mapping?.type || 'Auto Detected'}</div>
                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-700"></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Card className="border-white/5 bg-[#0f172a]/60 backdrop-blur-md overflow-hidden mt-6">
      <CardHeader className="bg-slate-900/50 border-b border-white/5 pb-4 px-6 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Network className="text-cyan-400" size={20} />
            Global AS Path Topology
          </CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Aggregated propagation graph for <strong className="text-emerald-400">{targetPrefix || 'all returned routes'}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1.5 bg-slate-800 rounded hover:bg-slate-700 text-slate-300"><ZoomOut size={16}/></button>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1.5 bg-slate-800 rounded hover:bg-slate-700 text-slate-300"><ZoomIn size={16}/></button>
          <button onClick={() => setIsFullscreen(true)} className="p-1.5 bg-slate-800 rounded hover:bg-slate-700 text-slate-300 ml-2"><Maximize size={16}/></button>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {renderGraph()}
      </CardContent>

      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-sm p-8 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Network className="text-cyan-400" /> AS Path Topology: {targetPrefix}
            </h2>
            <div className="flex gap-3">
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300"><ZoomOut size={20}/></button>
              <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300"><ZoomIn size={20}/></button>
              <button onClick={() => setIsFullscreen(false)} className="p-2 bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/40 ml-4"><X size={20}/></button>
            </div>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden shadow-2xl border border-slate-800">
            {renderGraph()}
          </div>
        </div>
      )}
    </Card>
  );
}
