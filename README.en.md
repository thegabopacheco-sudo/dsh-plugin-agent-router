# dsh-plugin-agent-router — Agent Router

Recomienda modelo/agente para una tarea segun fortalezas, presupuesto y contexto requerido, con reglas locales y explicaciones.

## Tools

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `policies` | Reglas |
| `route` | Recomendar modelo |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-agent-router` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-agent-router
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_AGENT_ROUTER_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\agent-router\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
