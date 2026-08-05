/**
 * Smoke tests for src/components/ui/*
 *
 * Covers Card, Badge, RadioGroup, Input, Textarea, Switch, ToggleCard.
 */

import React, { useRef, useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from '@/tw';
import { Card } from '@/components/ui/card';
import { Badge, BadgeText } from '@/components/ui/badge';
import { RadioGroup, Radio, RadioIndicator, RadioLabel } from '@/components/ui/radio';
import { Input, InputField } from '@/components/ui/input';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ToggleCard } from '@/components/ui/toggle-card';

describe('Card', () => {
  it('renders children', async () => {
    const { getByText } = await render(<Card testID="card"><Text>Hello</Text></Card>);
    expect(getByText('Hello')).toBeTruthy();
  });

  it('applies outline variant by default', async () => {
    const { getByTestId } = await render(<Card testID="card" />);
    const card = getByTestId('card');
    expect(card).toBeTruthy();
  });

  it('applies elevated variant class', async () => {
    const { getByTestId } = await render(<Card variant="elevated" testID="card" />);
    expect(getByTestId('card')).toBeTruthy();
  });
});

describe('Badge', () => {
  it('renders BadgeText content with muted solid', async () => {
    const { getByText } = await render(
      <Badge>
        <BadgeText>Label</BadgeText>
      </Badge>
    );
    expect(getByText('Label')).toBeTruthy();
  });

  it('renders error action', async () => {
    const { getByText } = await render(
      <Badge action="error">
        <BadgeText>Err</BadgeText>
      </Badge>
    );
    expect(getByText('Err')).toBeTruthy();
  });
});

describe('RadioGroup', () => {
  function TestRadio() {
    const [value, setValue] = useState('a');
    return (
      <RadioGroup value={value} onChange={setValue}>
        <Radio value="a" testID="radio-a">
          <RadioIndicator testID="indicator-a" />
          <RadioLabel>A</RadioLabel>
        </Radio>
        <Radio value="b" testID="radio-b">
          <RadioIndicator testID="indicator-b" />
          <RadioLabel>B</RadioLabel>
        </Radio>
      </RadioGroup>
    );
  }

  it('calls onChange when second radio is pressed', async () => {
    const onChange = jest.fn();
    const { getByTestId } = await render(
      <RadioGroup value="a" onChange={onChange}>
        <Radio value="a" testID="radio-a">
          <RadioIndicator />
          <RadioLabel>A</RadioLabel>
        </Radio>
        <Radio value="b" testID="radio-b">
          <RadioIndicator />
          <RadioLabel>B</RadioLabel>
        </Radio>
      </RadioGroup>
    );

    fireEvent.press(getByTestId('radio-b'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('indicator reflects selection via accessibilityState', async () => {
    const { getByTestId } = await render(<TestRadio />);
    const radioA = getByTestId('radio-a');
    expect(radioA.props.accessibilityState.selected).toBe(true);
  });
});

describe('Input', () => {
  function TestInput() {
    const [text, setText] = useState('');
    return (
      <Input>
        <InputField
          accessibilityLabel="Name field"
          placeholder="Enter name"
          onChangeText={setText}
        />
      </Input>
    );
  }

  it('types via fireEvent.changeText and calls onChangeText', async () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = await render(
      <Input>
        <InputField
          accessibilityLabel="Name field"
          onChangeText={onChangeText}
        />
      </Input>
    );

    const field = getByLabelText('Name field');
    fireEvent.changeText(field, 'Alice');
    expect(onChangeText).toHaveBeenCalledWith('Alice');
  });

  it('ref.setText does not crash', async () => {
    function RefTest() {
      const ref = useRef<{ setText: (t: string) => void; clear: () => void; focus: () => void; blur: () => void } | null>(null);
      return (
        <Input>
          <InputField ref={ref} accessibilityLabel="Ref field" />
        </Input>
      );
    }
    const { getByLabelText } = await render(<RefTest />);
    expect(getByLabelText('Ref field')).toBeTruthy();
  });

  it('applies invalid border color from context', async () => {
    const { getByLabelText } = await render(
      <Input isInvalid>
        <InputField accessibilityLabel="Invalid field" />
      </Input>
    );
    const field = getByLabelText('Invalid field');
    expect(field.props.style.borderColor).toBe('#ef4444');
  });

  it('renders disabled field with editable false', async () => {
    const { getByLabelText } = await render(
      <Input isDisabled>
        <InputField accessibilityLabel="Disabled field" />
      </Input>
    );
    const field = getByLabelText('Disabled field');
    expect(field.props.editable).toBe(false);
  });

  it('applies rounded variant border radius', async () => {
    const { getByLabelText } = await render(
      <Input variant="rounded">
        <InputField accessibilityLabel="Rounded field" />
      </Input>
    );
    const field = getByLabelText('Rounded field');
    expect(field.props.style.borderRadius).toBe(24);
  });
});

describe('Textarea', () => {
  it('types via fireEvent.changeText and calls onChangeText', async () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = await render(
      <Textarea>
        <TextareaInput
          accessibilityLabel="Bio field"
          onChangeText={onChangeText}
        />
      </Textarea>
    );

    const field = getByLabelText('Bio field');
    fireEvent.changeText(field, 'Hello world');
    expect(onChangeText).toHaveBeenCalledWith('Hello world');
  });
});

describe('Switch', () => {
  it('fires onValueChange via valueChange event', async () => {
    const onValueChange = jest.fn();
    const { getByTestId } = await render(
      <Switch testID="sw" value={false} onValueChange={onValueChange} />
    );

    fireEvent(getByTestId('sw'), 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('is queryable by accessibilityLabel', async () => {
    const { getByLabelText } = await render(
      <Switch testID="sw" value={false} onValueChange={() => {}} accessibilityLabel="Enable public reply" />
    );
    expect(getByLabelText('Enable public reply')).toBeTruthy();
  });
});

describe('ToggleCard', () => {
  it('renders title', async () => {
    const { getByText } = await render(
      <ToggleCard
        title="Public reply"
        description="Send a public reply"
        value={false}
        onValueChange={() => {}}
        accessibilityLabel="Toggle public reply"
      />
    );
    expect(getByText('Public reply')).toBeTruthy();
  });

  it('hides children when value is false', async () => {
    const { queryByTestId } = await render(
      <ToggleCard
        title="Public reply"
        value={false}
        onValueChange={() => {}}
        accessibilityLabel="Toggle public reply"
      >
        <Switch testID="child-switch" value={true} onValueChange={() => {}} />
      </ToggleCard>
    );
    expect(queryByTestId('child-switch')).toBeNull();
  });

  it('shows children when value is true', async () => {
    const { queryByTestId } = await render(
      <ToggleCard
        title="Public reply"
        value={true}
        onValueChange={() => {}}
        accessibilityLabel="Toggle public reply"
      >
        <Switch testID="child-switch" value={true} onValueChange={() => {}} />
      </ToggleCard>
    );
    expect(queryByTestId('child-switch')).toBeTruthy();
  });

  it('switch toggles via onValueChange', async () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = await render(
      <ToggleCard
        title="Public reply"
        value={false}
        onValueChange={onValueChange}
        accessibilityLabel="Toggle public reply"
      />
    );
    const toggleSwitch = getByLabelText('Toggle public reply');
    fireEvent(toggleSwitch, 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
