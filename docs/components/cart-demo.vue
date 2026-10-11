<template>
  <div class="cart-demo">
    <v-card class="mb-4">
      <v-card-title>Cart</v-card-title>
      <v-card-text>
        <v-row v-for="(item, index) in cart.items" :key="index" dense align="center">
          <v-col cols="5">{{ item.name }}</v-col>
          <v-col cols="3" class="text-right">{{ item.price.toFixed(2) }}</v-col>
          <v-col cols="4">
            <v-text-field
              v-model.number="item.quantity"
              type="number"
              label="Quantity"
              density="compact"
              :error-messages="item.$.fields.quantity.errors.map((error) => error.detail)"
              hide-details="auto"
            ></v-text-field>
          </v-col>
        </v-row>
        <p class="text-right mt-2"><strong>Total {{ total.toFixed(2) }}</strong></p>

        <v-text-field
          :model-value="cart.coupon ?? ''"
          label="Coupon"
          density="compact"
          hide-details
          class="mt-4"
          @update:model-value="(coupon: string) => (cart.coupon = coupon || null)"
        ></v-text-field>
        <v-switch v-model="cart.pickup" label="Collect in the shop" color="primary" hide-details></v-switch>

        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="cart.delivery.street"
              label="Street"
              :disabled="!cart.$.fields.delivery.enabled"
              :error-messages="cart.$.fields.delivery.fields.street.errors.map((error) => error.detail)"
              hide-details="auto"
            ></v-text-field>
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="cart.delivery.city"
              label="City"
              :disabled="!cart.$.fields.delivery.enabled"
              :error-messages="cart.$.fields.delivery.fields.city.errors.map((error) => error.detail)"
              hide-details="auto"
            ></v-text-field>
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions class="flex-wrap">
        <v-btn @click="sortByName">Sort by name</v-btn>
        <v-btn @click="fillAddress">Fill address</v-btn>
        <v-btn @click="editThenCancel">Edit, then cancel</v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>State</v-card-title>
      <v-card-text>
        <p>
          Cart is {{ cart.$.valid ? 'valid' : 'invalid' }};
          ValueChangedAction on the cart has fired {{ announcements }} times
        </p>
        <p v-if="cancelled">{{ cancelled }}</p>
        <pre class="output">{{ JSON.stringify(cart.$.value, null, 2) }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import {
  Field,
  Group,
  List,
  transaction,
  ValueChangedAction,
  Validators,
  view,
} from '../../src'; // from '@dynamicforms/vue-forms'

function createCart() {
  const cart = view(new Group({
    items: new List(new Group({
      sku: new Field({ value: '' }),
      name: new Field({ value: '' }),
      price: new Field({ value: 0 }),
      quantity: new Field({ value: 1, validators: [new Validators.MinValue(1)] }),
    })),
    coupon: new Field<string | null>({ value: null }),
    pickup: new Field({ value: false }),
    delivery: new Group({
      street: new Field({ value: '', validators: [new Validators.Required()] }),
      city: new Field({ value: '', validators: [new Validators.Required()] }),
    }),
  }));
  // a cart collected in the shop sends no delivery address, and keeps the one typed in
  watchEffect(() => {
    cart.$.fields.delivery.access = cart.pickup ? 'disabled-null' : 'editable';
  });
  return cart;
}

const cart = createCart();
cart.items.push(
  { sku: 'm-1', name: 'Mug', price: 12, quantity: 2 },
  { sku: 't-1', name: 'Teapot', price: 35, quantity: 1 },
  { sku: 'c-1', name: 'Coasters', price: 8, quantity: 4 },
);

const total = computed(() => cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));

// Every announcement of a change below the cart, counted
const announcements = ref(0);
cart.$.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  announcements.value += 1;
  return supr(field, newValue, oldValue);
}));

// The rows themselves move: each keeps its element, its errors and its touched
function sortByName() {
  cart.items.sort((a, b) => a.name.localeCompare(b.name));
}

// Three writes, one announcement
function fillAddress() {
  transaction(() => {
    cart.pickup = false;
    cart.delivery.street = 'Slovenska cesta 1';
    cart.delivery.city = 'Ljubljana';
  });
}

// The edit is applied and measured, then rolled back: the cart is as it was and nothing is announced
const cancelled = ref('');

function editThenCancel() {
  transaction((tx) => {
    cart.items.forEach((item) => (item.quantity = 10));
    cart.coupon = 'BULK';
    cancelled.value = `With 10 of each item the total would be ${total.value.toFixed(2)}; the edit was rolled back.`;
    tx.rollback();
  });
}
</script>

<style scoped>
.cart-demo {
  margin: 2rem 0;
}
.output {
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>
