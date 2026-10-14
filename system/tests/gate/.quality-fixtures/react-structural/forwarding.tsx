import { useState } from 'react';

export function DirectSource({ token }: { token: string }) {
  return <DirectMiddle token={token} />;
}
function DirectMiddle({ token }: { token: string }) {
  return <DirectEnd token={token} />;
}
function DirectEnd({ token }: { token: string }) {
  return <span>{token}</span>;
}

export function RenamedSource({ token }: { token: string }) {
  return <RenamedMiddle value={token} />;
}
function RenamedMiddle({ value }: { value: string }) {
  return <RenamedEnd value={value} />;
}
function RenamedEnd({ value }: { value: string }) {
  return <span>{value}</span>;
}

export function ModelSource({ model }: { model: { token: string } }) {
  return <ModelMiddle token={model.token} />;
}
function ModelMiddle({ token }: { token: string }) {
  return <ModelEnd token={token} />;
}
function ModelEnd({ token }: { token: string }) {
  return <span>{token}</span>;
}

export function ComputedSource({ token }: { token: string }) {
  return <ComputedMiddle token={token} />;
}
function ComputedMiddle({ token }: { token: string }) {
  const label = token.toUpperCase();
  return (
    <div title={label}>
      <ComputedEnd token={token} />
    </div>
  );
}
function ComputedEnd({ token }: { token: string }) {
  return <span>{token}</span>;
}

export function FunctionSource({ token }: { token: string }) {
  return renderToken(token);
}
function renderToken(token: string) {
  return <FunctionMiddle token={token} />;
}
function FunctionMiddle({ token }: { token: string }) {
  return <FunctionEnd token={token} />;
}
function FunctionEnd({ token }: { token: string }) {
  return <span>{token}</span>;
}

export function SetterSource({ setDocument }: { setDocument: (value: string) => void }) {
  return <SetterMiddle setDocument={setDocument} />;
}
function SetterMiddle({ setDocument }: { setDocument: (value: string) => void }) {
  return <SetterEnd setDocument={setDocument} />;
}
function SetterEnd({ setDocument }: { setDocument: (value: string) => void }) {
  return <button onClick={() => setDocument('changed')}>Change</button>;
}

export function LocalState() {
  const [expanded, setExpanded] = useState(false);
  return <button onClick={() => setExpanded(!expanded)}>{String(expanded)}</button>;
}
