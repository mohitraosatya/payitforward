import { useEffect, useState, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { fetchData } from '../api/client';
import type { ApiData, Request, Act } from '../types';

// ─── Layout ──────────────────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 48;

function buildLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  Dagre.layout(g);

  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id);
      return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
    }),
    edges,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Role = 'helper' | 'requester' | 'both';

interface PersonData {
  label: string;
  role: Role;
  actsGiven: number;
  actsReceived: number;
  actsConfirmed: number; // how many acts this person gave were confirmed by recipients
  requests: Request[];
  actsAsHelper: Act[];
}

// ─── Custom node ─────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<Role, { bg: string; border: string; text: string }> = {
  helper:    { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  requester: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
  both:      { bg: '#ede9fe', border: '#8b5cf6', text: '#4c1d95' },
};

function PersonNode({ data }: { data: PersonData }) {
  const c = ROLE_COLOR[data.role];
  const hasConfirmed = data.actsConfirmed > 0;
  return (
    <div
      style={{
        background: c.bg,
        border: `2px solid ${c.border}`,
        borderRadius: 8,
        padding: '6px 12px',
        minWidth: NODE_W,
        textAlign: 'center',
        cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(0,0,0,.12)',
      }}
    >
      <div style={{ fontWeight: 600, color: c.text, fontSize: 13 }}>
        {data.label}
        {hasConfirmed && (
          <span title={`${data.actsConfirmed} confirmed act${data.actsConfirmed > 1 ? 's' : ''}`} style={{ marginLeft: 4 }}>
            ✅
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
        {data.role === 'both'
          ? `helped ${data.actsGiven} · got helped ${data.actsReceived}`
          : data.role === 'helper'
          ? `helped ${data.actsGiven}`
          : `got helped`}
      </div>
    </div>
  );
}

const nodeTypes = { person: PersonNode };

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  node,
  onClose,
}: {
  node: Node<PersonData> | null;
  onClose: () => void;
}) {
  if (!node) return null;
  const d = node.data;
  return (
    <div className="tree-detail-panel">
      <button className="tree-detail-close" onClick={onClose}>
        ✕
      </button>
      <h3>{d.label}</h3>
      <span className={`badge badge--${d.role}`}>
        {d.role === 'both' ? 'Helper + Requester' : d.role === 'helper' ? 'Helper' : 'Requester'}
      </span>

      {d.requests.length > 0 && (
        <>
          <h4 style={{ marginTop: '1rem' }}>Requests</h4>
          {d.requests.map((r) => (
            <div key={r.request_id} className="detail-item">
              <span className="badge">{r.category}</span>
              <span
                className={`status-dot ${r.status === 'helped' ? 'status-dot--helped' : 'status-dot--open'}`}
              >
                {r.status}
              </span>
              <p>{r.description_public}</p>
              {r.amount_requested > 0 && <p className="detail-amount">${r.amount_requested}</p>}
            </div>
          ))}
        </>
      )}

      {d.actsAsHelper.length > 0 && (
        <>
          <h4 style={{ marginTop: '1rem' }}>Acts of Kindness Given</h4>
          {d.actsAsHelper.map((a) => (
            <div key={a.act_id} className={`detail-item ${a.confirmed ? 'detail-item--confirmed' : ''}`}>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="badge">{a.help_type}</span>
                {a.confirmed && <span className="confirmed-badge">✅ Confirmed</span>}
              </div>
              {a.amount > 0 && <span className="detail-amount">${a.amount}</span>}
              <p>{a.public_story}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Tree() {
  const [apiData, setApiData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<Node<PersonData> | null>(null);

  useEffect(() => {
    fetchData()
      .then((data) => {
        setApiData(data);
        const { nodes: ln, edges: le } = buildGraphData(data);
        setNodes(ln);
        setEdges(le);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelected(node as Node<PersonData>);
  }, []);

  const stats = apiData
    ? {
        total: apiData.requests.length,
        helped: apiData.requests.filter((r) => r.status === 'helped').length,
        acts: apiData.acts.length,
        open: apiData.requests.filter((r) => r.status === 'open').length,
        confirmed: apiData.acts.filter((a) => a.confirmed).length,
      }
    : null;

  return (
    <div className="page page--tree">
      <div className="tree-header">
        <h1>The Pay-It-Forward Tree</h1>
        <p className="page-sub">
          Blue = helper · Green = requester · Purple = both. Click any node for details.
        </p>
        {stats && (
          <div className="stats-row">
            <span className="stat-pill">{stats.total} requests</span>
            <span className="stat-pill stat-pill--green">{stats.helped} helped</span>
            <span className="stat-pill stat-pill--purple">{stats.acts} acts</span>
            <span className="stat-pill stat-pill--orange">{stats.open} open</span>
            {stats.confirmed > 0 && (
              <span className="stat-pill stat-pill--confirmed">✅ {stats.confirmed} confirmed</span>
            )}
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading && <div className="loading loading--large">Loading tree…</div>}

      {!loading && !error && nodes.length === 0 && (
        <div className="empty-state empty-state--large">
          No data yet. Be the first to{' '}
          <a href="#/request">request help</a> or{' '}
          <a href="#/help">help 3 people</a>!
        </div>
      )}

      {!loading && nodes.length > 0 && (
        <div className="tree-canvas-wrapper">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background color="#e2e8f0" gap={16} />
            <Controls />
            <MiniMap
              nodeColor={(n: Node<PersonData>) => {
                const c = ROLE_COLOR[n.data?.role ?? 'requester'];
                return c.border;
              }}
              maskColor="rgba(248,250,252,0.7)"
            />
          </ReactFlow>

          <DetailPanel node={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}

// ─── Graph builder ─────────────────────────────────────────────────────────

function buildGraphData(data: ApiData): { nodes: Node[]; edges: Edge[] } {
  const people = new Map<
    string,
    { isHelper: boolean; isRequester: boolean; requests: Request[]; acts: Act[] }
  >();

  const ensure = (name: string) => {
    if (!people.has(name)) {
      people.set(name, { isHelper: false, isRequester: false, requests: [], acts: [] });
    }
    return people.get(name)!;
  };

  data.requests.forEach((r) => {
    const p = ensure(r.display_name);
    p.isRequester = true;
    p.requests.push(r);
  });

  data.acts.forEach((a) => {
    const p = ensure(a.helper_name);
    p.isHelper = true;
    p.acts.push(a);
  });

  const rawNodes: Node<PersonData>[] = Array.from(people.entries()).map(([name, info]) => {
    const role: Role = info.isHelper && info.isRequester ? 'both' : info.isHelper ? 'helper' : 'requester';
    return {
      id: name,
      type: 'person',
      position: { x: 0, y: 0 },
      data: {
        label: name,
        role,
        actsGiven: info.acts.length,
        actsReceived: info.requests.filter((r) => r.status === 'helped').length,
        actsConfirmed: info.acts.filter((a) => a.confirmed).length,
        requests: info.requests,
        actsAsHelper: info.acts,
      },
    };
  });

  const rawEdges: Edge[] = data.acts
    .map((act) => {
      const req = data.requests.find((r) => r.request_id === act.request_id);
      if (!req) return null;
      return {
        id: act.act_id,
        source: act.helper_name,
        target: req.display_name,
        // Confirmed acts show a ✅ in the edge label; unconfirmed show help type only
        label: act.confirmed ? `${act.help_type} ✅` : act.help_type,
        data: { act },
        animated: act.confirmed,
        style: act.confirmed
          ? { stroke: '#10b981', strokeWidth: 2.5 }
          : { stroke: '#94a3b8', strokeWidth: 2 },
        labelStyle: act.confirmed
          ? { fontSize: 11, fill: '#065f46', fontWeight: 600 }
          : { fontSize: 11, fill: '#64748b' },
        labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.85 },
      } as Edge;
    })
    .filter((e): e is Edge => e !== null);

  if (rawNodes.length === 0) return { nodes: [], edges: [] };

  return buildLayout(rawNodes, rawEdges);
}
