# Calculator Tool

Perform mathematical calculations and evaluate expressions.

## Overview

The Calculator tool enables agents to perform mathematical calculations, from simple arithmetic to complex expressions involving trigonometry, logarithms, and other advanced functions.

## Configuration

**Category:** Computation  
**Tool Name:** `calculator`

## Parameters

| Parameter    | Type   | Required | Description                         |
| ------------ | ------ | -------- | ----------------------------------- |
| `expression` | string | Yes      | Mathematical expression to evaluate |

## Usage Example

```json
{
  "tool_name": "calculator",
  "parameters": {
    "expression": "sqrt(144) + 2^3 * pi"
  }
}
```

## Response Format

```json
{
  "expression": "sqrt(144) + 2^3 * pi",
  "result": 37.13274122871834,
  "type": "number"
}
```

## Supported Operations

### Basic Arithmetic

- Addition: `+`
- Subtraction: `-`
- Multiplication: `*`
- Division: `/`
- Modulo: `%`
- Exponentiation: `^` or `**`

### Mathematical Functions

- Square root: `sqrt(x)`
- Absolute value: `abs(x)`
- Ceiling: `ceil(x)`
- Floor: `floor(x)`
- Round: `round(x)`

### Trigonometric Functions

- Sine: `sin(x)`
- Cosine: `cos(x)`
- Tangent: `tan(x)`
- Arc sine: `asin(x)`
- Arc cosine: `acos(x)`
- Arc tangent: `atan(x)`

### Logarithmic Functions

- Natural logarithm: `log(x)` or `ln(x)`
- Base-10 logarithm: `log10(x)`
- Exponential: `exp(x)`

### Constants

- Pi: `pi` or `PI`
- Euler's number: `e` or `E`

## Usage Examples

### Simple Arithmetic

```json
{
  "expression": "15 + 27 * 3"
}

// Result: 96
```

### Complex Calculations

```json
{
  "expression": "(sqrt(25) + 3^2) * 2 / 7"
}

// Result: 4
```

### Trigonometry

```json
{
  "expression": "sin(pi/2) + cos(0)"
}

// Result: 2
```

### Financial Calculations

```json
{
  "expression": "10000 * (1 + 0.05)^10"
}

// Result: 16288.946... (compound interest)
```

## Best Practices

- **Clear Expressions**: Use parentheses to clarify order of operations
- **Validate Input**: Ensure expressions are mathematically valid
- **Precision**: Be aware of floating-point precision limitations
- **Unit Conversion**: Handle unit conversions separately

## Common Use Cases

- **Financial Calculations**: Interest, percentages, currency conversions
- **Scientific Computing**: Physics, chemistry, engineering calculations
- **Data Analysis**: Statistical calculations, averages, percentages
- **Geometry**: Area, volume, distance calculations
- **Unit Conversions**: Temperature, distance, weight conversions

## Configuration in Agents

```json
{
  "name": "math_assistant",
  "type": "chatbot",
  "tools": ["calculator"],
  "system_prompt": "You are a math assistant that can perform calculations..."
}
```

## Error Handling

The tool handles various error scenarios:

- **Syntax Errors**: Invalid mathematical syntax
- **Division by Zero**: Returns error for undefined operations
- **Invalid Functions**: Unknown function names
- **Out of Range**: Values outside valid ranges

## Limitations

- Limited to numerical calculations (no symbolic math)
- Floating-point precision limitations
- No support for matrices or vectors
- No support for complex numbers

## Related Tools

- [JSON Processor](/tools/json-processor) - Process numerical data in JSON
- [LLM Prompt](/tools/llm-prompt) - For natural language math problems
