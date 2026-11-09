import { Type, type FunctionDeclaration, type Schema } from '@google/genai';
import { endpoints, type Endpoint, type EndpointParam } from './registry.js';

const TYPE_MAP = {
  string: Type.STRING,
  integer: Type.INTEGER,
  number: Type.NUMBER,
  boolean: Type.BOOLEAN,
} as const;

function paramToProperty(param: EndpointParam): Schema {
  const property: Schema = {
    type: TYPE_MAP[param.type],
    description: param.description,
  };

  if (param.enum) property.enum = param.enum;
  if (param.nullable) property.nullable = true;
  if (param.minimum !== undefined) property.minimum = param.minimum;
  if (param.maximum !== undefined) property.maximum = param.maximum;
  if (param.maxLength !== undefined) property.maxLength = String(param.maxLength);

  return property;
}

function toDeclaration(endpoint: Endpoint): FunctionDeclaration {
  const writeNote =
    endpoint.effects === 'write'
      ? ' La interfaz pide confirmación del usuario antes de ejecutar esta acción.'
      : '';

  const declaration: FunctionDeclaration = {
    name: endpoint.id,
    description: `${endpoint.summary}. ${endpoint.description}${writeNote} Devuelve datos reales de la API; nunca inventes valores.`,
  };

  if (endpoint.params.length > 0) {
    const properties: Record<string, Schema> = {};
    const required: string[] = [];

    for (const param of endpoint.params) {
      properties[param.name] = paramToProperty(param);
      if (param.required) {
        required.push(param.name);
      }
    }

    declaration.parameters = {
      type: Type.OBJECT,
      properties,
      required,
    };
  }

  return declaration;
}

export function buildFunctionDeclarations(): FunctionDeclaration[] {
  return endpoints.map(toDeclaration);
}
