// DEV: Text olmayan container'ların içindeki raw string/number'ları otomatik <Text> ile sarar.
// Böylece "Text strings must be rendered..." hatası crash'e dönüşmez.
// Aynı anda KAYNAĞI da console.warn ile loglar ki sonra kalıcı fixlersin.
if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const { Text } = require('react-native');

  const origCreateElement = React.createElement;

  function typeName(t: any): string {
    if (typeof t === 'string') return t;
    return t?.displayName || t?.name || 'Unknown';
  }
  const isText = (type: any) => typeName(type) === 'Text';

  function toChildrenArray(props: any, restChildren: any[]): any[] {
    const all: any[] = [];
    if (props && Object.prototype.hasOwnProperty.call(props, 'children')) all.push(props.children);
    if (restChildren && restChildren.length) all.push(restChildren);
    const flat: any[] = [];
    const push = (v: any) => (Array.isArray(v) ? v.forEach(push) : flat.push(v));
    all.forEach(push);
    return flat;
  }

  function autoWrap(node: any, ancestry: any[]): any {
    if (node == null || node === false || node === true) return node;

    // primitive: string/number
    if (typeof node === 'string' || typeof node === 'number') {
      const parent = ancestry[ancestry.length - 1];
      if (!parent || !isText(parent.type)) {
        const preview = String(node).trim().slice(0, 80);
        const chain = ancestry.map(a => `<${typeName(a.type)}>`).join(' → ');
        // Kaynağı gör: crash ettirmiyoruz; sadece uyarı veriyoruz
        // (kırmızı ekran olmadan logdan dosya stack'i görebilirsin)
        // @ts-ignore
        console.warn(`AUTO-WRAP RAW TEXT "${preview}" inside ${chain}\n` + new Error().stack);
        return React.createElement(Text, null, node);
      }
      return node;
    }

    if (Array.isArray(node)) return node.map((c) => autoWrap(c, ancestry));

    if (node && typeof node === 'object' && node.type) {
      const children = toChildrenArray(node.props, []);
      const nextAncestry = ancestry.concat(node);
      const fixedChildren = children.map((c) => autoWrap(c, nextAncestry));

      // Çocukları yeniden geçir
      const newProps = { ...node.props, children: fixedChildren.length <= 1 ? fixedChildren[0] : fixedChildren };
      return { ...node, props: newProps };
    }

    return node;
  }

  (React as any).createElement = function (type: any, props: any, ...rest: any[]) {
    const el = origCreateElement(type, props, ...rest);
    try {
      return autoWrap(el, []);
    } catch {
      return el; // worst-case: dokunma
    }
  };
}
