import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
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
          x: (layerGroups.length - 1 - layerIdx) * colWidth + paddingX,
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

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  if (nodes.length === 0) return null;

  const nodeWidth = 100;
  const nodeHeight = 44;

  const renderGraph = () => (
    <div 
      className="relative w-full h-full min-h-[400px] overflow-auto bg-slate-900/50 rounded-xl border border-white/5"
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

            // Reversed direction: Arrow from target (left/origin) to source (right/local)
            const startX = targetNode.x + nodeWidth;
            const startY = targetNode.y + nodeHeight / 2;
            const endX = sourceNode.x;
            const endY = sourceNode.y + nodeHeight / 2;
            
            const ctrlX1 = startX + (endX - startX) / 2;
            const ctrlY1 = startY;
            const ctrlX2 = startX + (endX - startX) / 2;
            const ctrlY2 = endY;

            const isFaded = hoveredNode && sourceNode.id !== hoveredNode && targetNode.id !== hoveredNode;

            return (
              <path
                key={idx}
                d={`M ${startX} ${startY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${endX} ${endY}`}
                fill="none"
                stroke={isFaded ? "#1e293b" : "#334155"}
                strokeWidth={isFaded ? "1" : "1.5"}
                markerEnd="url(#arrowhead)"
                className={`transition-all duration-300 pointer-events-auto cursor-pointer ${isFaded ? 'opacity-20' : 'opacity-100 hover:stroke-[#06b6d4] hover:stroke-[2.5px] drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]'}`}
              />
            );
          })}
        </svg>

        {nodes.map(node => {
          const mapping = asMappings[node.id];
          const displayType = mapping?.type || (node.isOrigin ? 'Origin' : 'Transit');
          const isFaded = hoveredNode && node.id !== hoveredNode;
          
          return (
            <motion.div
              key={node.id}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: node.x / 1000 }} // staggered by horizontal position
              className={`absolute flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer group
                ${node.isOrigin 
                  ? 'bg-primary/20 border-primary shadow-none' 
                  : 'bg-surface-container-high border-[#2A2E35] hover:border-primary hover:shadow-none'}
                ${isFaded ? 'opacity-20 scale-95' : 'opacity-100 scale-100 hover:scale-105'}
                border rounded-xl px-2 py-1.5`}
              style={{
                left: node.x,
                top: node.y,
                width: nodeWidth,
                height: nodeHeight,
              }}
            >
              <span className={`text-xs font-bold font-mono ${node.isOrigin ? 'text-primary' : 'text-on-surface'}`}>
                AS{node.id}
              </span>
              <span className="text-[9px] text-on-surface-variant uppercase font-semibold tracking-wider">
                {displayType}
              </span>
              
              {/* Hover Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface-container-highest backdrop-blur-sm text-on-surface text-xs rounded-lg shadow-none border border-[#2A2E35] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none flex flex-col items-center">
                <div className="font-bold text-primary text-[13px]">{mapping?.name || ripeNames[node.id] || `AS${node.id}`}</div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">{mapping?.type || 'Auto Detected'}</div>
                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-[#2A2E35]"></div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Card className="border-[#2A2E35] bg-surface-container backdrop-blur-md overflow-hidden mt-6">
      <CardHeader className="bg-surface-container-high border-b border-[#2A2E35] pb-4 px-6 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-bold text-on-surface flex items-center gap-2">
            <Network className="text-primary" size={20} />
            Global AS Path Topology
          </CardTitle>
          <p className="text-xs text-on-surface-variant mt-1">
            Aggregated propagation graph for <strong className="text-primary">{targetPrefix || 'all returned routes'}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1.5 bg-surface-container-highest rounded hover:bg-[#2A2E35] text-on-surface"><ZoomOut size={16}/></button>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1.5 bg-surface-container-highest rounded hover:bg-[#2A2E35] text-on-surface"><ZoomIn size={16}/></button>
          <button onClick={() => setIsFullscreen(true)} className="p-1.5 bg-surface-container-highest rounded hover:bg-[#2A2E35] text-on-surface ml-2"><Maximize size={16}/></button>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {renderGraph()}
      </CardContent>

      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-surface-container/95 backdrop-blur-sm p-8 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-on-surface flex items-center gap-3">
              <Network className="text-primary" /> AS Path Topology: {targetPrefix}
            </h2>
            <div className="flex gap-3">
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} className="p-2 bg-surface-container-highest rounded-lg hover:bg-[#2A2E35] text-on-surface"><ZoomOut size={20}/></button>
              <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-2 bg-surface-container-highest rounded-lg hover:bg-[#2A2E35] text-on-surface"><ZoomIn size={20}/></button>
              <button onClick={() => setIsFullscreen(false)} className="p-2 bg-error/20 text-error rounded-lg hover:bg-error/40 ml-4"><X size={20}/></button>
            </div>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden shadow-none border border-[#2A2E35]">
            {renderGraph()}
          </div>
        </div>
      )}
    </Card>
  );
}
